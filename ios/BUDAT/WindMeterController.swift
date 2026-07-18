import Accelerate
import Foundation
import UIKit
import WindCore

/// Coordinates WindCore components: audio capture → features → quality → sweep → estimate.
/// All UI callbacks fire on the main queue; estimator/store access is confined
/// to `modelQueue` (the audio tap and JS bridge call in from different threads).
final class WindMeterController {
    var onSweepUpdate: ((SweepResult, Double, Double) -> Void)?
    var onEstimateUpdate: ((WindEstimate) -> Void)?
    var onHeadingUpdate: ((Double) -> Void)?

    private let sessionConfig = AudioSessionConfigurator()
    private var captureEngine: AudioCaptureEngine?
    private let featureExtractor = FeatureExtractor()
    private let sweepAnalyzer = SweepAnalyzer()
    private var windEstimator = WindEstimator.withDefaultPrior()
    private let headingProvider = DeviceHeadingProvider()
    private let modelQueue = DispatchQueue(label: "WindMeter.model")

    private let sessionID = UUID()
    private let deviceID = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"

    /// Persistent labeled-sample store — calibration data must survive the
    /// controller (a new one is created per measurement session).
    private let store: SampleStore? = {
        let url = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WindCore/samples.sqlite")
        return try? SampleStore(url: url)
    }()

    /// Timestamped recent headings so a window is labeled with its average
    /// heading, not the instant the window happened to end (a 3 s window
    /// during a sweep can span 30°+).
    private var recentHeadings: [(at: Date, degrees: Double)] = []
    private let headingLock = NSLock()

    // Labeled data for on-device refit (mirrored to `store` as it arrives).
    private var correctionWindows: [FeatureWindowRecord] = []
    private var allCorrections: [CorrectionRecord] = []
    private var correctionBuffer: [FeatureWindowRecord] = []
    private var correctionBufferStart = Date()
    /// Rolling clean windows for the live estimate (aggregated the same way
    /// training sessions are, so feature keys match the fitted model).
    private var liveWindows: [FeatureWindowRecord] = []
    private let liveWindowCapacity = 20
    private var isLocked = false

    func start() throws {
        sweepAnalyzer.reset()
        featureExtractor.qualityGates.reset()
        correctionBuffer.removeAll()
        isLocked = false

        try sessionConfig.configure()

        headingProvider.onHeading = { [weak self] heading, _ in
            guard let self else { return }
            self.headingLock.lock()
            self.recentHeadings.append((Date(), heading))
            if self.recentHeadings.count > 200 {
                self.recentHeadings.removeFirst(self.recentHeadings.count - 200)
            }
            self.headingLock.unlock()
            DispatchQueue.main.async { [weak self] in
                self?.onHeadingUpdate?(heading)
            }
        }
        headingProvider.start()

        let engine = AudioCaptureEngine()
        engine.onWindow = { [weak self] samples, offset in
            self?.processWindow(samples: samples, offset: offset)
        }
        try engine.start()
        captureEngine = engine

        modelQueue.async { [weak self] in
            self?.persistSessionStart(metadata: engine.metadata)
            self?.seedFromStore()
        }
    }

    func stop() {
        let metadata = captureEngine?.metadata
        captureEngine?.stop()
        captureEngine = nil
        headingProvider.stop()
        try? sessionConfig.deactivate()
        modelQueue.async { [weak self] in
            self?.persistSessionEnd(metadata: metadata)
        }
    }

    func submitCorrection(speedValue: Double, unit: String, readingType: String, directionDegrees: Double?) {
        let speedUnit: WindSpeedUnit
        switch unit.lowercased() {
        case "knots", "kt", "kts": speedUnit = .knots
        case "mph", "milesperhour": speedUnit = .milesPerHour
        case "kmh", "kph", "kilometersperhour": speedUnit = .kilometersPerHour
        default: speedUnit = .metersPerSecond
        }
        let reading: WindReadingType = readingType == "gust" ? .gust : readingType == "average" ? .average : .sustained
        let now = Date()

        modelQueue.async { [weak self] in
            guard let self else { return }
            let summary = correctionSummary(
                from: self.correctionBuffer,
                lockStability: self.sweepAnalyzer.currentResult.lockStability
            )
            let estimate = self.latestEstimate()
            let snapshot = estimate.map { self.windEstimator.predictionSnapshot(from: $0) }

            let record = CorrectionRecord(
                sessionID: self.sessionID,
                enteredSpeed: speedValue,
                unit: speedUnit,
                readingType: reading,
                observationStartedAt: self.correctionBufferStart,
                observationEndedAt: now,
                anemometerType: "handheld",
                predictionShown: snapshot,
                summary: summary
            )
            self.allCorrections.append(record)
            self.correctionWindows.append(contentsOf: self.correctionBuffer)

            if let store = self.store {
                for window in self.correctionBuffer {
                    try? store.insertFeatureWindow(window)
                }
                try? store.insertCorrection(record)
            }
            self.correctionBuffer.removeAll()
            self.correctionBufferStart = now

            try? self.windEstimator.refitPersonalization(
                corrections: self.allCorrections,
                windows: self.correctionWindows,
                deviceID: self.deviceID
            )
        }
    }

    /// Writes the full labeled dataset as JSON-lines and returns the path.
    func exportCalibrationData() throws -> URL {
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("windcore-samples-\(Int(Date().timeIntervalSince1970)).jsonl")
        guard let store else { throw SampleStoreError.sqlite("store unavailable") }
        try modelQueue.sync {
            try store.exportJSONLines(to: destination)
        }
        return destination
    }

    // MARK: - Persistence

    private func persistSessionStart(metadata: CaptureMetadata?) {
        guard let store else { return }
        let meta = metadata
        let record = SessionRecord(
            id: sessionID,
            deviceModel: meta?.deviceModel ?? AudioSessionConfigurator.deviceModelIdentifier(),
            osVersion: meta?.osVersion ?? ProcessInfo.processInfo.operatingSystemVersionString,
            audioRoute: meta?.audioRoute ?? "unknown",
            sampleRate: meta?.sampleRate ?? 48_000,
            bufferSize: meta?.bufferSize ?? 4096,
            captureMetadataJSON: (try? FeatureReflection.jsonString(from: meta as Any)) ?? "{}"
        )
        try? store.insertSession(record)
    }

    private func persistSessionEnd(metadata: CaptureMetadata?) {
        guard let store else { return }
        let result = sweepAnalyzer.currentResult
        let record = SessionRecord(
            id: sessionID,
            endedAt: Date(),
            deviceModel: metadata?.deviceModel ?? AudioSessionConfigurator.deviceModelIdentifier(),
            osVersion: metadata?.osVersion ?? ProcessInfo.processInfo.operatingSystemVersionString,
            audioRoute: metadata?.audioRoute ?? "unknown",
            sampleRate: metadata?.sampleRate ?? 48_000,
            bufferSize: metadata?.bufferSize ?? 4096,
            sweepBins: result.bins.map {
                SweepBinRecord(headingDegrees: $0.headingDegrees, energy: $0.energy,
                               smoothedEnergy: $0.smoothedEnergy, sampleCount: $0.sampleCount)
            },
            peakHeadingDegrees: result.peakHeadingDegrees,
            lobeClassification: LobeClassification(rawValue: result.lobeClassification.rawValue) ?? .unknown,
            lobeSharpness: result.lobeSharpness,
            lobeSeparationDegrees: result.lobeSeparationDegrees,
            lobeConfidence: result.lobeConfidence
        )
        try? store.insertSession(record)
        try? store.updateSessionEnd(id: sessionID)
    }

    /// Loads every past correction + its windows so personalization
    /// accumulates across app launches and measurement sessions.
    private func seedFromStore() {
        guard let store else { return }
        guard
            let corrections = try? store.corrections(), !corrections.isEmpty,
            let windows = try? store.featureWindows()
        else { return }
        allCorrections = corrections
        correctionWindows = windows
        try? windEstimator.refitPersonalization(
            corrections: corrections,
            windows: windows,
            deviceID: deviceID
        )
    }

    // MARK: - Processing

    private func latestEstimate() -> WindEstimate? {
        let source = correctionBuffer.isEmpty ? liveWindows : correctionBuffer
        guard let featureVec = aggregateFeatureVector(source), !featureVec.isEmpty else { return nil }
        return windEstimator.estimate(features: featureVec, deviceID: deviceID)
    }

    /// Circular mean of headings observed during the last window duration.
    private func windowHeading(windowDuration: TimeInterval = 3.0) -> Double {
        headingLock.lock()
        defer { headingLock.unlock() }
        let cutoff = Date().addingTimeInterval(-windowDuration)
        let recent = recentHeadings.filter { $0.at >= cutoff }.map(\.degrees)
        if recent.isEmpty {
            return recentHeadings.last?.degrees ?? 0
        }
        var sine = 0.0, cosine = 0.0
        for value in recent {
            sine += sin(value * .pi / 180)
            cosine += cos(value * .pi / 180)
        }
        let mean = atan2(sine, cosine) * 180 / .pi
        return mean < 0 ? mean + 360 : mean
    }

    private func processWindow(samples: [Float], offset: Double) {
        let heading = windowHeading()
        // The extractor runs the quality gates internally (stateful AGC check
        // included) — this is the single source of truth for contamination.
        let features = featureExtractor.extract(samples: samples,
                                                timeOffsetSeconds: offset,
                                                headingDegrees: heading)
        let quality = features.quality

        let featureVec = FeatureReflection.numericVector(from: features)
        let windowRecord = FeatureWindowRecord(
            sessionID: sessionID,
            timeOffsetSeconds: offset,
            headingDegrees: heading,
            featureJSON: (try? FeatureReflection.jsonString(from: features)) ?? "{}",
            featureVector: featureVec,
            qualityFlags: quality.isUsable ? [] : qualityFlagStrings(quality)
        )

        modelQueue.async { [weak self] in
            self?.handle(windowRecord: windowRecord, features: features, heading: heading, offset: offset, quality: quality)
        }
    }

    /// Runs on `modelQueue`.
    private func handle(windowRecord: FeatureWindowRecord, features: WindowFeatures, heading: Double, offset: Double, quality: QualityAssessment) {
        if isLocked {
            correctionBuffer.append(windowRecord)
        }

        guard quality.isUsable else { return }

        liveWindows.append(windowRecord)
        if liveWindows.count > liveWindowCapacity {
            liveWindows.removeFirst(liveWindows.count - liveWindowCapacity)
        }

        let sweepResult = sweepAnalyzer.ingest(headingDegrees: heading,
                                               energy: features.windProxyEnergy,
                                               timestamp: offset)
        if sweepResult.isLocked && !isLocked {
            isLocked = true
            correctionBufferStart = Date()
        }

        // Mic level in dBFS so the JS layer can drive pan guidance
        let levelDb = 20 * log10(max(features.rms, 1e-9))
        DispatchQueue.main.async { [weak self] in
            self?.onSweepUpdate?(sweepResult, heading, levelDb)
        }

        // Live estimate on every clean window (not just after lock) so the
        // speed readout tracks the wind while the user is still sweeping.
        if let estimate = latestEstimate() {
            DispatchQueue.main.async { [weak self] in
                self?.onEstimateUpdate?(estimate)
            }
        }
    }

    private func qualityFlagStrings(_ q: QualityAssessment) -> [String] {
        var flags: [String] = []
        if q.clipping { flags.append("clipping") }
        if q.agcSuspected { flags.append("agc") }
        if q.speechDetected { flags.append("speech") }
        if q.handlingNoise { flags.append("handling") }
        return flags
    }
}
