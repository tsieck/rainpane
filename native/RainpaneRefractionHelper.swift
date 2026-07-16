import AppKit
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

final class RefractionPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class CaptureCoordinator: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private let arguments: HelperArguments
    private let renderer: RefractionRenderer
    private let reporter: StatusEmitter
    private let screen: NSScreen
    private let captureQueue = DispatchQueue(label: "app.rainpane.refraction.capture", qos: .userInteractive)
    private let maximumRecoveryAttempts = 4
    private let emptyGeometryGrace: TimeInterval = 0.8
    private let recoveryStabilityWindow: TimeInterval = 4
    private var stream: SCStream?
    private var stoppingStream: SCStream?
    private var setupGeneration: UInt64?
    private var transitionGeneration: UInt64 = 0
    private var emptyGeometryGeneration: UInt64 = 0
    private var hasEmittedLive = false
    private var startRequested = false
    private var shouldBeVisible = false
    // Capture is demand-driven. The helper starts without touching
    // ScreenCaptureKit and wakes only after the first nonempty geometry frame.
    private var geometryPresent = false
    private var geometryCaptureActive = false
    private var emptyGeometryCheckScheduled = false
    private var permissionBlocked = false
    private var permissionPromptRequested = false
    private var terminalFailure = false
    private var recoveryAttempts = 0
    private var pendingSetupDelay: TimeInterval = 0
    private var isStopping = false
    private var stopCompletions: [() -> Void] = []

    init(arguments: HelperArguments, renderer: RefractionRenderer, reporter: StatusEmitter, screen: NSScreen) {
        self.arguments = arguments
        self.renderer = renderer
        self.reporter = reporter
        self.screen = screen
    }

    func start() {
        captureQueue.async { [weak self] in
            guard let self, !self.isStopping else { return }
            self.startRequested = true
            self.reconcileCapture(delay: 0.18)
        }
    }

    func setVisible(_ visible: Bool) {
        captureQueue.async { [weak self] in
            guard let self, !self.isStopping else { return }
            guard self.shouldBeVisible != visible else {
                self.reconcileCapture()
                return
            }

            self.shouldBeVisible = visible
            self.transitionGeneration &+= 1
            self.setupGeneration = nil
            self.hasEmittedLive = false

            if visible {
                // A fresh visibility cycle is an explicit opportunity to retry
                // after the user changes Screen Recording permission.
                self.permissionBlocked = false
                self.permissionPromptRequested = false
                self.terminalFailure = false
                self.recoveryAttempts = 0
                if self.geometryCaptureActive {
                    self.reporter.emit(.starting, deduplicate: true)
                } else {
                    self.reporter.emit(.paused, message: "Waiting for droplet geometry", deduplicate: true)
                }
                self.reconcileCapture(delay: 0.18)
            } else {
                self.pendingSetupDelay = 0
                self.renderer.discardCapturedFrame()
                self.reconcileCapture()
            }
        }
    }

    func setGeometryActive(_ active: Bool) {
        captureQueue.async { [weak self] in
            guard let self, !self.isStopping else { return }
            self.geometryPresent = active

            if active {
                self.emptyGeometryGeneration &+= 1
                self.emptyGeometryCheckScheduled = false
                guard !self.geometryCaptureActive else { return }

                self.geometryCaptureActive = true
                self.transitionGeneration &+= 1
                self.setupGeneration = nil
                self.terminalFailure = false
                self.recoveryAttempts = 0
                if self.shouldBeVisible && !self.permissionBlocked {
                    self.reporter.emit(.starting, message: "Droplets returned; resuming local refraction capture")
                }
                self.reconcileCapture()
                return
            }

            guard self.geometryCaptureActive, !self.emptyGeometryCheckScheduled else { return }
            self.emptyGeometryCheckScheduled = true
            self.emptyGeometryGeneration &+= 1
            let generation = self.emptyGeometryGeneration
            self.captureQueue.asyncAfter(deadline: .now() + self.emptyGeometryGrace) { [weak self] in
                guard let self, !self.isStopping else { return }
                self.emptyGeometryCheckScheduled = false
                guard self.emptyGeometryGeneration == generation,
                      !self.geometryPresent,
                      self.geometryCaptureActive else {
                    return
                }

                self.geometryCaptureActive = false
                self.transitionGeneration &+= 1
                self.setupGeneration = nil
                self.pendingSetupDelay = 0
                self.hasEmittedLive = false
                self.recoveryAttempts = 0
                if !self.permissionBlocked && !self.terminalFailure {
                    self.reporter.emit(.paused, message: "Waiting for droplet geometry", deduplicate: true)
                }
                self.renderer.discardCapturedFrame()
                self.reconcileCapture()
            }
        }
    }

    func stop(completion: @escaping () -> Void) {
        captureQueue.async { [weak self] in
            guard let self else {
                completion()
                return
            }
            self.stopCompletions.append(completion)
            guard !self.isStopping else {
                self.finishStopIfReady()
                return
            }

            self.isStopping = true
            self.startRequested = false
            self.shouldBeVisible = false
            self.geometryCaptureActive = false
            self.transitionGeneration &+= 1
            self.emptyGeometryGeneration &+= 1
            self.setupGeneration = nil
            self.pendingSetupDelay = 0
            self.renderer.discardCapturedFrame()
            self.stopActiveStream()
            self.finishStopIfReady()
        }
    }

    private var captureIsRequested: Bool {
        startRequested
            && shouldBeVisible
            && geometryCaptureActive
            && !permissionBlocked
            && !terminalFailure
            && !isStopping
    }

    private func requestIsCurrent(_ generation: UInt64) -> Bool {
        captureIsRequested && transitionGeneration == generation
    }

    private func reconcileCapture(delay: TimeInterval = 0) {
        if delay > 0 {
            pendingSetupDelay = max(pendingSetupDelay, delay)
        }

        guard captureIsRequested else {
            setupGeneration = nil
            stopActiveStream()
            finishStopIfReady()
            return
        }
        guard stream == nil, stoppingStream == nil, setupGeneration == nil else { return }

        let generation = transitionGeneration
        setupGeneration = generation
        let setupDelay = pendingSetupDelay
        pendingSetupDelay = 0

        // Giving WindowServer one beat after orderFront is important: the
        // helper must appear in SCShareableContent before we construct the
        // application-exclusion filter.
        captureQueue.asyncAfter(deadline: .now() + setupDelay) { [weak self] in
            guard let self else { return }
            guard self.setupGeneration == generation, self.requestIsCurrent(generation) else {
                if self.setupGeneration == generation {
                    self.setupGeneration = nil
                }
                self.reconcileCapture()
                return
            }
            self.beginCaptureSetup(generation: generation)
        }
    }

    private func beginCaptureSetup(generation: UInt64) {
        guard setupGeneration == generation, requestIsCurrent(generation) else { return }
        guard CGPreflightScreenCaptureAccess() else {
            setupGeneration = nil
            permissionBlocked = true
            renderer.discardCapturedFrame()
            reporter.emit(
                .permissionNeeded,
                message: "Allow Rainpane screen recording in System Settings, then toggle Photoreal Refraction off and on.",
                deduplicate: true
            )

            guard !permissionPromptRequested else { return }
            permissionPromptRequested = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                let granted = CGRequestScreenCaptureAccess()
                self.captureQueue.async { [weak self] in
                    guard let self, !self.isStopping, granted else { return }
                    self.permissionBlocked = false
                    self.transitionGeneration &+= 1
                    self.reporter.emit(.starting, message: "Screen Recording permission granted; starting refraction")
                    self.reconcileCapture()
                }
            }
            return
        }

        loadShareableContent(attempt: 0, generation: generation)
    }

    private func loadShareableContent(attempt: Int, generation: UInt64) {
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { [weak self] content, error in
            guard let self else { return }
            self.captureQueue.async { [weak self] in
                self?.handleShareableContent(content, error: error, attempt: attempt, generation: generation)
            }
        }
    }

    private func handleShareableContent(
        _ content: SCShareableContent?,
        error: Error?,
        attempt: Int,
        generation: UInt64
    ) {
            guard setupGeneration == generation, requestIsCurrent(generation) else { return }
            if let error {
                setupGeneration = nil
                if !CGPreflightScreenCaptureAccess() {
                    permissionBlocked = true
                    renderer.discardCapturedFrame()
                    reporter.emit(.permissionNeeded, message: error.localizedDescription, deduplicate: true)
                } else {
                    recoverFromFailure("ScreenCaptureKit could not enumerate content: \(error.localizedDescription)")
                }
                return
            }
            guard let content else {
                setupGeneration = nil
                recoverFromFailure("ScreenCaptureKit returned no shareable content")
                return
            }

            guard let display = content.displays.first(where: { $0.displayID == arguments.displayID }) else {
                setupGeneration = nil
                recoverFromFailure("Display \(arguments.displayID) is no longer available")
                return
            }

            let helperPID = getpid()
            let requiredPIDs: Set<pid_t> = [helperPID, arguments.parentPID]
            let excludedApplications = content.applications.filter { requiredPIDs.contains($0.processID) }
            let foundPIDs = Set(excludedApplications.map(\.processID))
            let missingPIDs = requiredPIDs.subtracting(foundPIDs)

            if !missingPIDs.isEmpty, attempt < 6 {
                captureQueue.asyncAfter(deadline: .now() + 0.18) { [weak self] in
                    guard let self,
                          self.setupGeneration == generation,
                          self.requestIsCurrent(generation) else { return }
                    self.loadShareableContent(attempt: attempt + 1, generation: generation)
                }
                return
            }

            guard missingPIDs.isEmpty else {
                let missing = missingPIDs.sorted().map(String.init).joined(separator: ", ")
                setupGeneration = nil
                recoverFromFailure(
                    "Could not safely exclude helper and parent application processes (missing PIDs: \(missing))"
                )
                return
            }

            let filter = SCContentFilter(
                display: display,
                excludingApplications: excludedApplications,
                exceptingWindows: visibleParentWindows(
                    in: content,
                    on: display,
                    parentPID: arguments.parentPID
                )
            )
            let configuration = SCStreamConfiguration()
            let scale: CGFloat
            if #available(macOS 14.0, *) {
                scale = CGFloat(filter.pointPixelScale)
            } else {
                scale = screen.backingScaleFactor
            }
            configuration.width = max(Int(CGFloat(display.width) * scale), 1)
            configuration.height = max(Int(CGFloat(display.height) * scale), 1)
            configuration.pixelFormat = kCVPixelFormatType_32BGRA
            configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
            // ScreenCaptureKit owns at most two surfaces while the renderer's
            // mailbox retains only the newest undrawn buffer.
            configuration.queueDepth = 2
            configuration.showsCursor = false
            configuration.capturesAudio = false
            configuration.scalesToFit = true
            configuration.colorSpaceName = CGColorSpace.sRGB

            let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
            do {
                try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: captureQueue)
            } catch {
                setupGeneration = nil
                recoverFromFailure("Could not attach ScreenCaptureKit output: \(error.localizedDescription)")
                return
            }
            guard setupGeneration == generation, requestIsCurrent(generation) else { return }
            setupGeneration = nil
            self.stream = stream
            stream.startCapture { [weak self] error in
                guard let self else { return }
                self.captureQueue.async { [weak self] in
                    guard let self else { return }
                    guard self.stream === stream || self.stoppingStream === stream else { return }
                    if let error {
                        if !CGPreflightScreenCaptureAccess() {
                            self.permissionBlocked = true
                            self.reporter.emit(.permissionNeeded, message: error.localizedDescription, deduplicate: true)
                            self.transitionGeneration &+= 1
                            self.stopActiveStream()
                        } else {
                            self.recoverFromFailure("Screen capture failed to start: \(error.localizedDescription)")
                        }
                    } else if !self.requestIsCurrent(generation) {
                        self.stopActiveStream()
                    }
                }
            }
    }

    private func recoverFromFailure(_ message: String) {
        setupGeneration = nil
        hasEmittedLive = false
        // Fail closed before retrying: a completed CAMetalLayer drawable can
        // otherwise outlive the ScreenCaptureKit stream that produced it.
        renderer.discardCapturedFrame()
        guard shouldBeVisible, geometryCaptureActive, startRequested, !isStopping else {
            reconcileCapture()
            return
        }

        guard CGPreflightScreenCaptureAccess() else {
            permissionBlocked = true
            transitionGeneration &+= 1
            reporter.emit(.permissionNeeded, message: message, deduplicate: true)
            stopActiveStream()
            return
        }

        recoveryAttempts += 1
        guard recoveryAttempts <= maximumRecoveryAttempts else {
            terminalFailure = true
            transitionGeneration &+= 1
            reporter.emit(
                .error,
                message: "\(message) Native stream recovery stopped after \(maximumRecoveryAttempts) attempts."
            )
            stopActiveStream()
            return
        }

        let delay = 0.25 * pow(2, Double(recoveryAttempts - 1))
        transitionGeneration &+= 1
        pendingSetupDelay = delay
        reporter.emit(
            .starting,
            message: "\(message) Retrying stream \(recoveryAttempts)/\(maximumRecoveryAttempts)."
        )
        stopActiveStream()
        reconcileCapture()
    }

    private func stopActiveStream() {
        // Clearing is required even when the stream has already disappeared;
        // the layer may still retain the last successfully presented drawable.
        renderer.discardCapturedFrame()
        guard stoppingStream == nil else { return }
        guard let activeStream = stream else {
            if captureIsRequested {
                reconcileCapture()
            }
            return
        }

        stream = nil
        stoppingStream = activeStream
        hasEmittedLive = false
        activeStream.stopCapture { [weak self] _ in
            guard let self else { return }
            self.captureQueue.async { [weak self] in
                guard let self, self.stoppingStream === activeStream else { return }
                self.stoppingStream = nil
                if self.isStopping {
                    self.finishStopIfReady()
                } else {
                    self.reconcileCapture()
                }
            }
        }
    }

    private func finishStopIfReady() {
        guard isStopping, stream == nil, stoppingStream == nil else { return }
        let completions = stopCompletions
        stopCompletions.removeAll()
        completions.forEach { $0() }
    }

    private func visibleParentWindows(
        in content: SCShareableContent,
        on display: SCDisplay,
        parentPID: pid_t
    ) -> [SCWindow] {
        content.windows.filter { window in
            guard window.owningApplication?.processID == parentPID else {
                return false
            }
            // Excluding the parent application removes the transparent
            // Electron rain overlays. Normal Rainpane windows are explicit
            // exceptions so the Settings/Demo surface remains refractable.
            return !isDisplaySizedOverlay(window.frame, displayFrame: display.frame)
        }
    }

    private func isDisplaySizedOverlay(_ windowFrame: CGRect, displayFrame: CGRect) -> Bool {
        guard !windowFrame.isEmpty, !displayFrame.isEmpty else { return false }
        let intersection = windowFrame.intersection(displayFrame)
        guard !intersection.isNull else { return false }
        let displayArea = displayFrame.width * displayFrame.height
        let intersectionArea = intersection.width * intersection.height
        let coverage = intersectionArea / max(displayArea, 1)
        let widthRatio = windowFrame.width / max(displayFrame.width, 1)
        let heightRatio = windowFrame.height / max(displayFrame.height, 1)
        return coverage >= 0.90 && widthRatio >= 0.93 && heightRatio >= 0.90
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        captureQueue.async { [weak self] in
            guard let self,
                  !self.isStopping,
                  self.stream === stream,
                  self.stoppingStream !== stream else { return }
            self.stream = nil
            self.hasEmittedLive = false
            self.renderer.discardCapturedFrame()
            if !CGPreflightScreenCaptureAccess() {
                self.permissionBlocked = true
                self.transitionGeneration &+= 1
                self.reporter.emit(.permissionNeeded, message: error.localizedDescription, deduplicate: true)
            } else {
                self.recoverFromFailure("Screen capture stopped: \(error.localizedDescription)")
            }
        }
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        guard outputType == .screen,
              self.stream === stream,
              captureIsRequested,
              sampleBuffer.isValid,
              let pixelBuffer = sampleBuffer.imageBuffer,
              CVPixelBufferGetPixelFormatType(pixelBuffer) == kCVPixelFormatType_32BGRA else {
            return
        }

        renderer.update(capturedPixelBuffer: pixelBuffer)
        if !hasEmittedLive {
            hasEmittedLive = true
            reporter.emit(.live)
            let liveStream = stream
            captureQueue.asyncAfter(deadline: .now() + recoveryStabilityWindow) { [weak self] in
                guard let self,
                      self.stream === liveStream,
                      self.hasEmittedLive,
                      self.captureIsRequested else { return }
                self.recoveryAttempts = 0
            }
        }
    }
}

final class HelperApplicationDelegate: NSObject, NSApplicationDelegate, @unchecked Sendable {
    private let arguments: HelperArguments
    private let reporter: StatusEmitter
    private var panel: RefractionPanel?
    private var renderer: RefractionRenderer?
    private var capture: CaptureCoordinator?
    private var input: JSONLineInput?
    private var parentMonitor: DispatchSourceTimer?
    private var isTerminating = false

    init(arguments: HelperArguments, reporter: StatusEmitter) {
        self.arguments = arguments
        self.reporter = reporter
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let screen = NSScreen.screens.first(where: { screen in
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
                return false
            }
            return number.uint32Value == arguments.displayID
        }) else {
            reporter.emit(.error, message: "Display \(arguments.displayID) is not attached")
            NSApp.terminate(nil)
            return
        }

        do {
            let renderer = try RefractionRenderer(frame: NSRect(origin: .zero, size: screen.frame.size))
            let panel = makePanel(screen: screen, contentView: renderer.view)
            self.renderer = renderer
            self.panel = panel

            // Register the transparent window with WindowServer before taking
            // the SCShareableContent snapshot used for process exclusion.
            panel.orderFrontRegardless()

            let capture = CaptureCoordinator(
                arguments: arguments,
                renderer: renderer,
                reporter: reporter,
                screen: screen
            )
            self.capture = capture
            installInputReader()
            installParentMonitor()

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
                capture.start()
            }
        } catch {
            reporter.emit(.error, message: error.localizedDescription)
            NSApp.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        input?.stop()
        parentMonitor?.cancel()
    }

    private func makePanel(screen: NSScreen, contentView: NSView) -> RefractionPanel {
        let panel = RefractionPanel(
            contentRect: screen.frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false,
            screen: screen
        )
        panel.setFrame(screen.frame, display: false)
        panel.contentView = contentView
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue - 1)
        panel.collectionBehavior = [
            .canJoinAllSpaces,
            .stationary,
            .fullScreenAuxiliary,
            .ignoresCycle,
        ]
        return panel
    }

    private func installInputReader() {
        let input = JSONLineInput(
            onMessage: { [weak self] message in
                self?.handle(message)
            },
            onEnd: { [weak self] in
                self?.shutdown()
            }
        )
        self.input = input
        input.start()
    }

    private func installParentMonitor() {
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now() + 2, repeating: 2)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            if kill(self.arguments.parentPID, 0) != 0, errno == ESRCH {
                self.shutdown()
            }
        }
        timer.resume()
        parentMonitor = timer
    }

    private func handle(_ message: IncomingMessage) {
        switch message {
        case .frame(let frame):
            renderer?.update(frame: frame)
            capture?.setGeometryActive(!frame.droplets.isEmpty)
        case .visibility(let visible):
            renderer?.setVisible(visible)
            capture?.setVisible(visible)
            DispatchQueue.main.async { [weak self] in
                guard let panel = self?.panel else { return }
                if visible {
                    panel.orderFrontRegardless()
                } else {
                    panel.orderOut(nil)
                }
            }
        case .shutdown:
            shutdown()
        }
    }

    private func shutdown() {
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.isTerminating else { return }
            self.isTerminating = true
            self.input?.stop()
            self.parentMonitor?.cancel()
            self.renderer?.clear()
            self.capture?.stop {
                DispatchQueue.main.async {
                    NSApp.terminate(nil)
                }
            }
        }
    }
}
