import CoreGraphics
import Foundation
import simd

struct HelperArguments {
    let displayID: CGDirectDisplayID
    let parentPID: pid_t

    static func parse(_ arguments: [String]) throws -> HelperArguments {
        var displayValue: String?
        var parentValue: String?
        var positional: [String] = []
        var index = 0

        while index < arguments.count {
            let argument = arguments[index]
            switch argument {
            case "--display-id":
                index += 1
                guard index < arguments.count else {
                    throw ProtocolError.invalidArguments("--display-id requires a value")
                }
                displayValue = arguments[index]
            case "--parent-pid":
                index += 1
                guard index < arguments.count else {
                    throw ProtocolError.invalidArguments("--parent-pid requires a value")
                }
                parentValue = arguments[index]
            default:
                if argument.hasPrefix("--display-id=") {
                    displayValue = String(argument.dropFirst("--display-id=".count))
                } else if argument.hasPrefix("--parent-pid=") {
                    parentValue = String(argument.dropFirst("--parent-pid=".count))
                } else if argument.hasPrefix("-") {
                    throw ProtocolError.invalidArguments("unknown option \(argument)")
                } else {
                    positional.append(argument)
                }
            }
            index += 1
        }

        if displayValue == nil, !positional.isEmpty {
            displayValue = positional.removeFirst()
        }
        if parentValue == nil, !positional.isEmpty {
            parentValue = positional.removeFirst()
        }
        guard positional.isEmpty else {
            throw ProtocolError.invalidArguments("too many positional arguments")
        }
        guard let displayValue,
              let rawDisplayID = UInt32(displayValue),
              rawDisplayID > 0 else {
            throw ProtocolError.invalidArguments("display ID must be a positive UInt32")
        }
        guard let parentValue,
              let rawParentPID = Int32(parentValue),
              rawParentPID > 0 else {
            throw ProtocolError.invalidArguments("parent PID must be a positive Int32")
        }

        return HelperArguments(displayID: CGDirectDisplayID(rawDisplayID), parentPID: pid_t(rawParentPID))
    }
}

enum ProtocolError: LocalizedError {
    case invalidArguments(String)
    case invalidMessage(String)

    var errorDescription: String? {
        switch self {
        case .invalidArguments(let message):
            return "Invalid arguments: \(message). Usage: rainpane-refraction-helper <displayID> <parentPID>"
        case .invalidMessage(let message):
            return "Invalid message: \(message)"
        }
    }
}

enum HelperStatus: String {
    case starting
    case paused
    case permissionNeeded = "permission-needed"
    case live
    case error
}

final class StatusEmitter: @unchecked Sendable {
    private let lock = NSLock()
    private var lastStatus: HelperStatus?

    func emit(_ status: HelperStatus, message: String? = nil, deduplicate: Bool = false) {
        lock.lock()
        defer { lock.unlock() }

        if deduplicate, lastStatus == status {
            return
        }
        lastStatus = status

        var object: [String: Any] = [
            "type": "status",
            "status": status.rawValue,
        ]
        if let message, !message.isEmpty {
            object["message"] = message
        }

        guard let data = try? JSONSerialization.data(withJSONObject: object),
              var line = String(data: data, encoding: .utf8) else {
            return
        }
        line.append("\n")
        FileHandle.standardOutput.write(Data(line.utf8))
    }
}

struct DropletGPU {
    var center: SIMD2<Float>
    var radii: SIMD2<Float>
    // opacity, refraction, blur, seed
    var optical: SIMD4<Float>
    // highlight, shape variance, reserved, reserved
    var appearance: SIMD4<Float>
}

struct ProtectedRegionGPU {
    // x, y, width, height in logical viewport pixels
    var rect: SIMD4<Float>
    // corner radius, reserved, reserved, reserved
    var parameters: SIMD4<Float>
}

struct FramePayload {
    static let maximumDroplets = 4_096
    static let maximumProtectedRegions = 64

    let viewport: SIMD2<Float>
    let droplets: [DropletGPU]
    let protectedRegions: [ProtectedRegionGPU]

    static func parse(_ object: [String: Any]) throws -> FramePayload {
        let viewportObject = object["viewport"] as? [String: Any]
        let width = number(object["width"]) ?? number(viewportObject?["width"])
        let height = number(object["height"]) ?? number(viewportObject?["height"])

        guard let width, let height, width > 0, height > 0 else {
            throw ProtocolError.invalidMessage("frame requires positive width and height")
        }

        let rawDroplets = object["droplets"] as? [[String: Any]] ?? []
        let droplets = rawDroplets.prefix(maximumDroplets).enumerated().compactMap { index, raw in
            parseDroplet(raw, fallbackSeed: Float(index) * 0.618_033_9)
        }

        var rawRegions = object["protectedRects"] as? [[String: Any]]
            ?? object["protectedRegions"] as? [[String: Any]]
        if rawRegions == nil,
           let protectedMask = object["protectedMask"] as? [String: Any] {
            rawRegions = protectedMask["rects"] as? [[String: Any]]
        }
        let protectedRegions = (rawRegions ?? []).prefix(maximumProtectedRegions).compactMap(parseProtectedRegion)

        return FramePayload(
            viewport: SIMD2(Float(width), Float(height)),
            droplets: droplets,
            protectedRegions: protectedRegions
        )
    }

    private static func parseDroplet(_ raw: [String: Any], fallbackSeed: Float) -> DropletGPU? {
        guard let x = number(raw["x"]), let y = number(raw["y"]) else {
            return nil
        }

        let radius = number(raw["radius"]) ?? number(raw["r"])
        let radiusX = number(raw["radiusX"])
            ?? number(raw["rx"])
            ?? number(raw["width"]).map { $0 * 0.5 }
            ?? radius
        let radiusY = number(raw["radiusY"])
            ?? number(raw["ry"])
            ?? number(raw["height"]).map { $0 * 0.5 }
            ?? radius
        guard let radiusX, let radiusY, radiusX > 0, radiusY > 0 else {
            return nil
        }

        let opacity = clamp(number(raw["opacity"]) ?? number(raw["alpha"]) ?? 0.92, 0, 1)
        let refraction = clamp(number(raw["refraction"]) ?? number(raw["refractionStrength"]) ?? 1, 0, 2)
        let blur = clamp(number(raw["blur"]) ?? number(raw["blurStrength"]) ?? 0.72, 0, 2)
        let seed = Float(number(raw["seed"]) ?? Double(fallbackSeed))
        let highlight = clamp(number(raw["highlight"]) ?? number(raw["highlightStrength"]) ?? 1, 0, 2)
        let shape = clamp(number(raw["shape"]) ?? number(raw["shapeVariance"]) ?? 1, 0, 2)

        return DropletGPU(
            center: SIMD2(Float(x), Float(y)),
            radii: SIMD2(Float(clamp(radiusX, 0.75, 512)), Float(clamp(radiusY, 0.75, 512))),
            optical: SIMD4(Float(opacity), Float(refraction), Float(blur), seed),
            appearance: SIMD4(Float(highlight), Float(shape), 0, 0)
        )
    }

    private static func parseProtectedRegion(_ raw: [String: Any]) -> ProtectedRegionGPU? {
        guard let x = number(raw["x"]),
              let y = number(raw["y"]),
              let width = number(raw["width"]),
              let height = number(raw["height"]),
              width > 0,
              height > 0 else {
            return nil
        }
        let radius = clamp(number(raw["cornerRadius"]) ?? number(raw["radius"]) ?? 0, 0, min(width, height) * 0.5)
        return ProtectedRegionGPU(
            rect: SIMD4(Float(x), Float(y), Float(width), Float(height)),
            parameters: SIMD4(Float(radius), 0, 0, 0)
        )
    }

    private static func number(_ value: Any?) -> Double? {
        if let value = value as? NSNumber {
            return value.doubleValue
        }
        if let value = value as? String {
            return Double(value)
        }
        return nil
    }

    private static func clamp(_ value: Double, _ lower: Double, _ upper: Double) -> Double {
        min(max(value, lower), upper)
    }
}

enum IncomingMessage {
    case frame(FramePayload)
    case visibility(Bool)
    case shutdown

    static func parse(_ data: Data) throws -> IncomingMessage {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else {
            throw ProtocolError.invalidMessage("expected a JSON object with a type")
        }

        switch type {
        case "frame":
            return .frame(try FramePayload.parse(object))
        case "visibility":
            guard let visible = object["visible"] as? Bool else {
                throw ProtocolError.invalidMessage("visibility requires a boolean visible field")
            }
            return .visibility(visible)
        case "shutdown":
            return .shutdown
        default:
            throw ProtocolError.invalidMessage("unknown type \(type)")
        }
    }
}

final class JSONLineInput: @unchecked Sendable {
    private let queue = DispatchQueue(label: "app.rainpane.refraction.stdin")
    private var buffer = Data()
    private let onMessage: (IncomingMessage) -> Void
    private let onEnd: () -> Void

    init(onMessage: @escaping (IncomingMessage) -> Void, onEnd: @escaping () -> Void) {
        self.onMessage = onMessage
        self.onEnd = onEnd
    }

    func start() {
        FileHandle.standardInput.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            self?.queue.async {
                self?.consume(data)
            }
        }
    }

    func stop() {
        FileHandle.standardInput.readabilityHandler = nil
    }

    private func consume(_ data: Data) {
        if data.isEmpty {
            stop()
            onEnd()
            return
        }

        buffer.append(data)
        while let newline = buffer.firstIndex(of: 0x0A) {
            var line = Data(buffer[..<newline])
            buffer.removeSubrange(...newline)
            if line.last == 0x0D {
                line.removeLast()
            }
            guard !line.isEmpty else { continue }

            do {
                onMessage(try IncomingMessage.parse(line))
            } catch {
                Self.log(error.localizedDescription)
            }
        }
    }

    private static func log(_ message: String) {
        FileHandle.standardError.write(Data("rainpane-refraction-helper: \(message)\n".utf8))
    }
}
