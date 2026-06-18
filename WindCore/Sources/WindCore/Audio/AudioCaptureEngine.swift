import Foundation

/// Slices a continuous mono sample stream into overlapping analysis windows.
/// Pure logic, separated from AVAudioEngine so it can be tested directly.
public final class SampleWindower {
    public let sampleRate: Double
    public let windowLength: Int
    public let hopLength: Int

    /// Called with each completed window and its start offset in seconds
    /// from the beginning of the stream.
    public var onWindow: (([Float], Double) -> Void)?

    private var buffer: [Float] = []
    private var emittedWindows = 0

    public init(sampleRate: Double = 48_000, windowDuration: TimeInterval = 3.0, hopDuration: TimeInterval = 1.0) {
        self.sampleRate = sampleRate
        self.windowLength = max(1, Int(windowDuration * sampleRate))
        self.hopLength = max(1, Int(hopDuration * sampleRate))
        buffer.reserveCapacity(windowLength + hopLength)
    }

    public func append(_ samples: [Float]) {
        buffer.append(contentsOf: samples)
        while buffer.count >= windowLength {
            let window = Array(buffer[0..<windowLength])
            let offset = Double(emittedWindows * hopLength) / sampleRate
            onWindow?(window, offset)
            emittedWindows += 1
            buffer.removeFirst(hopLength)
        }
    }

    public func reset() {
        buffer.removeAll(keepingCapacity: true)
        emittedWindows = 0
    }
}

#if canImport(AVFoundation)
import AVFoundation

/// AVAudioEngine input tap that converts the hardware stream to 48 kHz mono
/// Float32 and emits 2–5 s analysis windows via `SampleWindower`.
public final class AudioCaptureEngine {
    public struct Configuration: Sendable {
        public var targetSampleRate: Double
        public var windowDuration: TimeInterval
        public var hopDuration: TimeInterval
        public var tapBufferSize: AVAudioFrameCount

        public init(
            targetSampleRate: Double = 48_000,
            windowDuration: TimeInterval = 3.0,
            hopDuration: TimeInterval = 1.0,
            tapBufferSize: AVAudioFrameCount = 4096
        ) {
            self.targetSampleRate = targetSampleRate
            self.windowDuration = windowDuration
            self.hopDuration = hopDuration
            self.tapBufferSize = tapBufferSize
        }
    }

    public enum CaptureError: Error {
        case formatUnavailable
        case converterUnavailable
    }

    public let configuration: Configuration
    /// Delivered on an internal audio queue; hop off it before touching UI.
    public var onWindow: (([Float], Double) -> Void)?
    public private(set) var metadata: CaptureMetadata?
    public private(set) var isRunning = false

    private let engine = AVAudioEngine()
    private let windower: SampleWindower
    private let queue = DispatchQueue(label: "WindCore.AudioCaptureEngine")

    public init(configuration: Configuration = Configuration()) {
        self.configuration = configuration
        self.windower = SampleWindower(
            sampleRate: configuration.targetSampleRate,
            windowDuration: configuration.windowDuration,
            hopDuration: configuration.hopDuration
        )
        windower.onWindow = { [weak self] samples, offset in
            self?.onWindow?(samples, offset)
        }
    }

    public func start() throws {
        guard !isRunning else { return }

        let input = engine.inputNode
        let hardwareFormat = input.outputFormat(forBus: 0)
        guard hardwareFormat.sampleRate > 0 else {
            throw CaptureError.formatUnavailable
        }
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: configuration.targetSampleRate,
            channels: 1,
            interleaved: false
        ) else {
            throw CaptureError.formatUnavailable
        }

        let needsConversion = hardwareFormat.sampleRate != targetFormat.sampleRate
            || hardwareFormat.channelCount != 1
            || hardwareFormat.commonFormat != .pcmFormatFloat32
        var converter: AVAudioConverter?
        if needsConversion {
            guard let made = AVAudioConverter(from: hardwareFormat, to: targetFormat) else {
                throw CaptureError.converterUnavailable
            }
            converter = made
        }

        windower.reset()
        input.installTap(onBus: 0, bufferSize: configuration.tapBufferSize, format: hardwareFormat) { [weak self] buffer, _ in
            guard let self else { return }
            self.queue.async {
                let samples: [Float]
                if let converter {
                    samples = Self.convert(buffer, with: converter, to: targetFormat) ?? []
                } else {
                    samples = Self.monoSamples(from: buffer)
                }
                guard !samples.isEmpty else { return }
                self.windower.append(samples)
            }
        }

        engine.prepare()
        try engine.start()
        isRunning = true
        metadata = makeMetadata(hardwareFormat: hardwareFormat)
    }

    public func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRunning = false
    }

    private func makeMetadata(hardwareFormat: AVAudioFormat) -> CaptureMetadata {
        #if os(iOS)
        return AudioSessionConfigurator().currentMetadata(bufferSize: Int(configuration.tapBufferSize))
        #else
        return CaptureMetadata(
            deviceModel: Host.current().localizedName ?? "mac",
            osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
            audioRoute: "default-input",
            sampleRate: hardwareFormat.sampleRate,
            bufferSize: Int(configuration.tapBufferSize)
        )
        #endif
    }

    private static func convert(
        _ buffer: AVAudioPCMBuffer,
        with converter: AVAudioConverter,
        to format: AVAudioFormat
    ) -> [Float]? {
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
            return nil
        }
        var consumed = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }
        guard error == nil else { return nil }
        return monoSamples(from: output)
    }

    private static func monoSamples(from buffer: AVAudioPCMBuffer) -> [Float] {
        guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return [] }
        let frames = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        if channelCount == 1 {
            return Array(UnsafeBufferPointer(start: channels[0], count: frames))
        }
        // Average channels down to mono.
        var mono = [Float](repeating: 0, count: frames)
        for channel in 0..<channelCount {
            let data = channels[channel]
            for frame in 0..<frames {
                mono[frame] += data[frame]
            }
        }
        let scale = 1.0 / Float(channelCount)
        for frame in 0..<frames {
            mono[frame] *= scale
        }
        return mono
    }
}
#endif
