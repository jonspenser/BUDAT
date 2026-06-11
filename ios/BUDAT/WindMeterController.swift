import Accelerate
import Foundation
import UIKit
import WindCore

/// Coordinates WindCore components: audio capture → features → quality → sweep → estimate.
/// All callbacks fire on the main queue.
final class WindMeterController {
    var onSweepUpdate: ((SweepResult) -> Void)?
    var onEstimateUpdate: ((WindEstimate) -> Void)?

    private let sessionConfig = AudioSessionConfigurator()
    private var captureEngine: AudioCaptureEngine?
    private let featureExtractor = FeatureExtractor()
    private let qualityGates = QualityGates()
    private let sweepAnalyzer = SweepAnalyzer()
    private var windEstimator = WindEstimator()
    private let headingProvider = DeviceHeadingProvider()

    private let sessionID = UUID()
    private let deviceID = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
    private var currentHeading: Double = 0
    private var currentTimestamp: TimeInterval = 0

    // In-memory labeled data for on-device refit
    private var correctionWindows: [FeatureWindowRecord] = []
    private var allCorrections: [CorrectionRecord] = []
    private var correctionDirections: [Double] = []
    private var correctionBuffer: [FeatureWindowRecord] = []
    private var correctionBufferStart = Date()
    private var isLocked = false

    func start() throws {
        sweepAnalyzer.reset()
        qualityGates.reset()
        correctionBuffer.removeAll()
        isLocked = false

        try sessionConfig.configure()

        headingProvider.onHeading = { [weak self] heading, ts in
            self?.currentHeading = heading
            self?.currentTimestamp = ts
        }
        headingProvider.start()

        let engine = AudioCaptureEngine()
        engine.onWindow = { [weak self] samples, offset in
            self?.processWindow(samples: samples, offset: offset)
        }
        try engine.start()
        captureEngine = engine
    }

    func stop() {
        captureEngine?.stop()
        captureEngine = nil
        headingProvider.stop()
        try? sessionConfig.deactivate()
    }

    func submitCorrection(speedMS: Double, unit: String, readingType: String, directionDegrees: Double?) {
        let speedUnit: WindSpeedUnit = .metersPerSecond
        let reading: WindReadingType = readingType == "gust" ? .gust : readingType == "average" ? .average : .sustained
        let now = Date()
        let summary = correctionSummary(from: correctionBuffer, lockStability: sweepAnalyzer.currentResult.lockStability)
        let estimate = latestEstimate()
        let snapshot = estimate.map { windEstimator.predictionSnapshot(from: $0) }

        let record = CorrectionRecord(
            sessionID: sessionID,
            enteredSpeed: speedMS,
            unit: speedUnit,
            readingType: reading,
            observationStartedAt: correctionBufferStart,
            observationEndedAt: now,
            anemometerType: "handheld",
            predictionShown: snapshot,
            summary: summary
        )
        allCorrections.append(record)
        if let directionDegrees {
            correctionDirections.append(normalizedDegrees(directionDegrees))
        }
        correctionWindows.append(contentsOf: correctionBuffer)
        correctionBuffer.removeAll()
        correctionBufferStart = now

        // Refit on background thread
        let corrections = allCorrections
        let windows = correctionWindows
        let deviceID = self.deviceID
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            try? self.windEstimator.refitPersonalization(corrections: corrections, windows: windows, deviceID: deviceID)
        }
    }

    // MARK: - Private

    private func latestEstimate() -> WindEstimate? {
        guard let featureVec = aggregateFeatureVector(correctionBuffer), !featureVec.isEmpty else { return nil }
        return windEstimator.estimate(features: featureVec, deviceID: deviceID)
    }

    private func normalizedDegrees(_ degrees: Double) -> Double {
        let wrapped = degrees.truncatingRemainder(dividingBy: 360)
        return wrapped < 0 ? wrapped + 360 : wrapped
    }

    private func processWindow(samples: [Float], offset: Double) {
        let heading = currentHeading
        let features = featureExtractor.extract(samples: samples,
                                                timeOffsetSeconds: offset,
                                                headingDegrees: heading)

        var peak: Float = 0
        vDSP_maxv(samples, 1, &peak, vDSP_Length(samples.count))
        let qInputs = QualityGates.Inputs(
            samples: samples,
            sampleRate: 48_000,
            rms: features.rms,
            peak: Double(peak),
            spectralFlatness: features.spectralFlatness,
            spectralCentroid: features.spectralCentroid,
            lowBandRatio: features.bandEnergyLow / max(features.rms * features.rms, 1e-12)
        )
        let quality = qualityGates.assess(qInputs)

        // Build FeatureWindowRecord for buffering/refit
        let featureVec = FeatureReflection.featureVector(from: features)
        let windowRecord = FeatureWindowRecord(
            sessionID: sessionID,
            timeOffsetSeconds: offset,
            headingDegrees: heading,
            featureJSON: "{}",
            featureVector: featureVec,
            qualityFlags: quality.isUsable ? [] : qualityFlagStrings(quality)
        )

        if isLocked {
            correctionBuffer.append(windowRecord)
        }

        if quality.isUsable {
            let sweepResult = sweepAnalyzer.ingest(headingDegrees: heading,
                                                   energy: features.windProxyEnergy,
                                                   timestamp: offset)
            if sweepResult.isLocked && !isLocked {
                isLocked = true
                correctionBufferStart = Date()
            }

            DispatchQueue.main.async { [weak self] in
                self?.onSweepUpdate?(sweepResult)
            }

            if sweepResult.isLocked {
                let estimate = windEstimator.estimate(features: featureVec, deviceID: deviceID)
                DispatchQueue.main.async { [weak self] in
                    self?.onEstimateUpdate?(estimate)
                }
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
