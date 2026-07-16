import AppKit
import CoreMedia
import CoreVideo
import Metal
import QuartzCore
import simd

private struct FrameUniforms {
    var viewport: SIMD2<Float>
    var captureSize: SIMD2<Float>
    var dropletCount: UInt32
    var protectedCount: UInt32
    var elapsedTime: Float
    var padding: Float
}

final class MetalOverlayView: NSView {
    override func makeBackingLayer() -> CALayer {
        let layer = CAMetalLayer()
        layer.isOpaque = false
        layer.backgroundColor = CGColor.clear
        layer.contentsScale = window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
        return layer
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
    }

    required init?(coder: NSCoder) {
        nil
    }

    var metalLayer: CAMetalLayer {
        guard let layer = layer as? CAMetalLayer else {
            preconditionFailure("MetalOverlayView requires a CAMetalLayer")
        }
        return layer
    }

    override func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        updateDrawableSize()
    }

    override func layout() {
        super.layout()
        updateDrawableSize()
    }

    func updateDrawableSize() {
        let scale = window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
        metalLayer.contentsScale = scale
        metalLayer.drawableSize = CGSize(
            width: max(bounds.width * scale, 1),
            height: max(bounds.height * scale, 1)
        )
    }
}

final class RefractionRenderer: @unchecked Sendable {
    let view: MetalOverlayView

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let pipeline: MTLRenderPipelineState
    private let sampler: MTLSamplerState
    private let renderQueue = DispatchQueue(label: "app.rainpane.refraction.metal", qos: .userInteractive)
    private let captureMailboxLock = NSLock()
    private let startedAt = ProcessInfo.processInfo.systemUptime

    private var textureCache: CVMetalTextureCache?
    private var latestCapturedPixelBuffer: CVPixelBuffer?
    private var captureDrainScheduled = false
    private var capturedCVTexture: CVMetalTexture?
    private var capturedTexture: MTLTexture?
    private var dropletBuffer: MTLBuffer?
    private var protectedRegionBuffer: MTLBuffer?
    private var viewport = SIMD2<Float>(1, 1)
    private var dropletCount: UInt32 = 0
    private var protectedRegionCount: UInt32 = 0
    private var isVisible = false
    private var presentationGeneration: UInt64 = 0

    init(frame: NSRect) throws {
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw RendererError.metalUnavailable
        }
        guard let commandQueue = device.makeCommandQueue() else {
            throw RendererError.commandQueueUnavailable
        }

        self.device = device
        self.commandQueue = commandQueue
        self.view = MetalOverlayView(frame: frame)

        let library = try device.makeLibrary(source: refractionMetalSource, options: nil)
        guard let vertexFunction = library.makeFunction(name: "dropletVertex"),
              let fragmentFunction = library.makeFunction(name: "dropletFragment") else {
            throw RendererError.shaderFunctionMissing
        }

        let pipelineDescriptor = MTLRenderPipelineDescriptor()
        pipelineDescriptor.label = "Rainpane analytic water refraction"
        pipelineDescriptor.vertexFunction = vertexFunction
        pipelineDescriptor.fragmentFunction = fragmentFunction
        pipelineDescriptor.colorAttachments[0].pixelFormat = .bgra8Unorm_srgb
        pipelineDescriptor.colorAttachments[0].isBlendingEnabled = true
        pipelineDescriptor.colorAttachments[0].rgbBlendOperation = .add
        pipelineDescriptor.colorAttachments[0].alphaBlendOperation = .add
        pipelineDescriptor.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
        pipelineDescriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        pipelineDescriptor.colorAttachments[0].sourceAlphaBlendFactor = .one
        pipelineDescriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        self.pipeline = try device.makeRenderPipelineState(descriptor: pipelineDescriptor)

        let samplerDescriptor = MTLSamplerDescriptor()
        samplerDescriptor.minFilter = .linear
        samplerDescriptor.magFilter = .linear
        samplerDescriptor.mipFilter = .notMipmapped
        samplerDescriptor.sAddressMode = .clampToEdge
        samplerDescriptor.tAddressMode = .clampToEdge
        guard let sampler = device.makeSamplerState(descriptor: samplerDescriptor) else {
            throw RendererError.samplerUnavailable
        }
        self.sampler = sampler

        let metalLayer = view.metalLayer
        metalLayer.device = device
        metalLayer.pixelFormat = .bgra8Unorm_srgb
        metalLayer.framebufferOnly = true
        metalLayer.isOpaque = false
        metalLayer.maximumDrawableCount = 3
        metalLayer.displaySyncEnabled = true
        metalLayer.presentsWithTransaction = false
        metalLayer.colorspace = CGColorSpace(name: CGColorSpace.sRGB)
        metalLayer.opacity = 0
        view.updateDrawableSize()

        let cacheStatus = CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)
        guard cacheStatus == kCVReturnSuccess else {
            throw RendererError.textureCacheUnavailable(cacheStatus)
        }

        // Keep a valid buffer bound even when no protected regions are active.
        var emptyRegion = ProtectedRegionGPU(rect: .zero, parameters: .zero)
        protectedRegionBuffer = device.makeBuffer(
            bytes: &emptyRegion,
            length: MemoryLayout<ProtectedRegionGPU>.stride,
            options: .storageModeShared
        )
    }

    func update(frame: FramePayload) {
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.viewport = frame.viewport
            self.dropletCount = UInt32(frame.droplets.count)
            self.protectedRegionCount = UInt32(frame.protectedRegions.count)
            self.dropletBuffer = self.upload(frame.droplets, reusing: self.dropletBuffer)
            self.protectedRegionBuffer = self.upload(
                frame.protectedRegions,
                reusing: self.protectedRegionBuffer
            )
        }
    }

    func update(capturedPixelBuffer pixelBuffer: CVPixelBuffer) {
        // ScreenCaptureKit may outpace Metal when the desktop is busy. Keep a
        // single replaceable mailbox slot so old IOSurfaces never accumulate
        // in DispatchQueue closures.
        captureMailboxLock.lock()
        latestCapturedPixelBuffer = pixelBuffer
        if captureDrainScheduled {
            captureMailboxLock.unlock()
            return
        }
        captureDrainScheduled = true
        captureMailboxLock.unlock()

        renderQueue.async { [weak self] in
            self?.drainLatestCapturedFrame()
        }
    }

    func discardCapturedFrame() {
        captureMailboxLock.lock()
        latestCapturedPixelBuffer = nil
        captureMailboxLock.unlock()

        renderQueue.async { [weak self] in
            guard let self else { return }
            self.capturedCVTexture = nil
            self.capturedTexture = nil
            self.invalidatePresentedContent()
        }
    }

    private func drainLatestCapturedFrame() {
        captureMailboxLock.lock()
        let pixelBuffer = latestCapturedPixelBuffer
        latestCapturedPixelBuffer = nil
        captureMailboxLock.unlock()

        if let pixelBuffer, let textureCache {

            let width = CVPixelBufferGetWidth(pixelBuffer)
            let height = CVPixelBufferGetHeight(pixelBuffer)
            var cvTexture: CVMetalTexture?
            let result = CVMetalTextureCacheCreateTextureFromImage(
                kCFAllocatorDefault,
                textureCache,
                pixelBuffer,
                nil,
                .bgra8Unorm,
                width,
                height,
                0,
                &cvTexture
            )
            if result == kCVReturnSuccess,
               let cvTexture,
               let texture = CVMetalTextureGetTexture(cvTexture) {
                capturedCVTexture = cvTexture
                capturedTexture = texture
                draw()
            }
        }

        captureMailboxLock.lock()
        let hasNewerFrame = latestCapturedPixelBuffer != nil
        if !hasNewerFrame {
            captureDrainScheduled = false
        }
        captureMailboxLock.unlock()

        if hasNewerFrame {
            // Yield behind already queued geometry/visibility work, then draw
            // whichever capture frame is newest at that point.
            renderQueue.async { [weak self] in
                self?.drainLatestCapturedFrame()
            }
        }
    }

    func setVisible(_ visible: Bool) {
        if !visible {
            captureMailboxLock.lock()
            latestCapturedPixelBuffer = nil
            captureMailboxLock.unlock()
        }

        renderQueue.async { [weak self] in
            guard let self else { return }
            self.isVisible = visible
            if !visible {
                self.capturedCVTexture = nil
                self.capturedTexture = nil
                self.invalidatePresentedContent()
            }
        }
    }

    func clear() {
        discardCapturedFrame()
        renderQueue.async { [weak self] in
            guard let self else { return }
            self.dropletCount = 0
        }
    }

    private func upload<Element>(_ values: [Element], reusing existing: MTLBuffer?) -> MTLBuffer? {
        guard !values.isEmpty else { return existing }
        let requiredLength = values.count * MemoryLayout<Element>.stride
        let buffer: MTLBuffer
        if let existing, existing.length >= requiredLength {
            buffer = existing
        } else {
            let capacity = max(256, requiredLength.nextPowerOfTwo)
            guard let grownBuffer = device.makeBuffer(length: capacity, options: .storageModeShared) else {
                return existing
            }
            buffer = grownBuffer
        }

        values.withUnsafeBytes { bytes in
            guard let baseAddress = bytes.baseAddress else { return }
            buffer.contents().copyMemory(from: baseAddress, byteCount: bytes.count)
        }
        return buffer
    }

    private func draw() {
        guard isVisible,
              let drawable = view.metalLayer.nextDrawable(),
              let commandBuffer = commandQueue.makeCommandBuffer() else {
            return
        }

        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = drawable.texture
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].storeAction = .store
        pass.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 0)

        if dropletCount > 0,
           let capturedTexture,
           let dropletBuffer,
           let protectedRegionBuffer,
           let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: pass) {
            var uniforms = FrameUniforms(
                viewport: viewport,
                captureSize: SIMD2(Float(capturedTexture.width), Float(capturedTexture.height)),
                dropletCount: dropletCount,
                protectedCount: protectedRegionCount,
                elapsedTime: Float(ProcessInfo.processInfo.systemUptime - startedAt),
                padding: 0
            )

            encoder.label = "Rainpane droplet refraction"
            encoder.setRenderPipelineState(pipeline)
            encoder.setVertexBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
            encoder.setVertexBuffer(dropletBuffer, offset: 0, index: 1)
            encoder.setFragmentBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
            encoder.setFragmentBuffer(protectedRegionBuffer, offset: 0, index: 1)
            encoder.setFragmentTexture(capturedTexture, index: 0)
            encoder.setFragmentSamplerState(sampler, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6, instanceCount: Int(dropletCount))
            encoder.endEncoding()
        }

        let generation = presentationGeneration
        commandBuffer.present(drawable)
        commandBuffer.addCompletedHandler { [weak self] _ in
            guard let self else { return }
            self.renderQueue.async { [weak self] in
                guard let self,
                      self.presentationGeneration == generation,
                      self.isVisible,
                      self.capturedTexture != nil else {
                    return
                }
                self.setLayerContentVisible(true)
            }
        }
        commandBuffer.commit()
    }

    private func invalidatePresentedContent() {
        presentationGeneration &+= 1
        setLayerContentVisible(false)
        presentTransparentFrame()
    }

    private func setLayerContentVisible(_ visible: Bool) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        view.metalLayer.opacity = visible ? 1 : 0
        CATransaction.commit()
    }

    private func presentTransparentFrame() {
        guard let drawable = view.metalLayer.nextDrawable(),
              let commandBuffer = commandQueue.makeCommandBuffer() else {
            return
        }

        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = drawable.texture
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].storeAction = .store
        pass.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 0)
        guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: pass) else {
            return
        }
        encoder.endEncoding()
        commandBuffer.present(drawable)
        commandBuffer.commit()
    }
}

private extension Int {
    var nextPowerOfTwo: Int {
        guard self > 1 else { return 1 }
        var value = self - 1
        value |= value >> 1
        value |= value >> 2
        value |= value >> 4
        value |= value >> 8
        value |= value >> 16
        if MemoryLayout<Int>.size == 8 {
            value |= value >> 32
        }
        return value + 1
    }
}

enum RendererError: LocalizedError {
    case metalUnavailable
    case commandQueueUnavailable
    case shaderFunctionMissing
    case samplerUnavailable
    case textureCacheUnavailable(CVReturn)

    var errorDescription: String? {
        switch self {
        case .metalUnavailable:
            return "Metal is unavailable on this display"
        case .commandQueueUnavailable:
            return "Metal could not create a command queue"
        case .shaderFunctionMissing:
            return "Metal refraction shader functions are missing"
        case .samplerUnavailable:
            return "Metal could not create the scene sampler"
        case .textureCacheUnavailable(let code):
            return "Core Video could not create a Metal texture cache (\(code))"
        }
    }
}
