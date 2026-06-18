import Foundation

#if os(iOS)
import AVFoundation

/// Configures AVAudioSession for measurement-grade capture: `.measurement`
/// mode opts out of voice processing and most AGC, and we pin the built-in
/// mic so the route is predictable. Route/orientation metadata is extracted
/// here so it can be logged with every session.
public final class AudioSessionConfigurator {
    public struct Preferences: Sendable {
        public var sampleRate: Double
        public var ioBufferDuration: TimeInterval

        public init(sampleRate: Double = 48_000, ioBufferDuration: TimeInterval = 0.02) {
            self.sampleRate = sampleRate
            self.ioBufferDuration = ioBufferDuration
        }
    }

    private let session: AVAudioSession

    public init(session: AVAudioSession = .sharedInstance()) {
        self.session = session
    }

    public func configure(preferences: Preferences = Preferences()) throws {
        // .record + .measurement disables system audio processing (AGC, EQ,
        // voice isolation) to the extent iOS allows.
        try session.setCategory(.record, mode: .measurement, options: [])
        try session.setPreferredSampleRate(preferences.sampleRate)
        try session.setPreferredIOBufferDuration(preferences.ioBufferDuration)

        if let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
            try? session.setPreferredInput(builtIn)
            // Prefer the bottom mic with an omnidirectional pattern: least
            // directional coloration and the most consistent placement.
            if let bottom = builtIn.dataSources?.first(where: { $0.orientation == .bottom }) {
                if bottom.supportedPolarPatterns?.contains(.omnidirectional) == true {
                    try? bottom.setPreferredPolarPattern(.omnidirectional)
                }
                try? builtIn.setPreferredDataSource(bottom)
            }
        }

        try session.setActive(true)
    }

    public func deactivate() {
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Snapshot of the active route and device context for logging.
    public func currentMetadata(bufferSize: Int) -> CaptureMetadata {
        let inputs = session.currentRoute.inputs
        let route = inputs
            .map { "\($0.portType.rawValue):\($0.portName)" }
            .joined(separator: "+")
        let orientation = inputs
            .compactMap { $0.selectedDataSource?.orientation?.rawValue }
            .first

        return CaptureMetadata(
            deviceModel: Self.deviceModelIdentifier(),
            osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
            audioRoute: route.isEmpty ? "unknown" : route,
            inputOrientation: orientation,
            sampleRate: session.sampleRate,
            bufferSize: bufferSize,
            measurementModeActive: session.mode == .measurement
        )
    }

    /// Hardware identifier (e.g. "iPhone15,2") — more specific than the
    /// marketing name, which matters because mic placement varies by model.
    public static func deviceModelIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafeBytes(of: &systemInfo.machine) { buffer in
            let data = buffer.prefix(while: { $0 != 0 })
            return String(decoding: data, as: UTF8.self)
        }
    }
}
#endif
