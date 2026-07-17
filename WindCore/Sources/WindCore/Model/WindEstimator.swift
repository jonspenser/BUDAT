import Foundation

public enum WindEstimatorStatus: String, Codable, Equatable, Sendable {
    case unavailable
    case priorDominated
    case personalized
    case lowConfidence
    case rejectedByQualityGate
}

public struct WindEstimate: Codable, Equatable, Sendable {
    public var speedMetersPerSecond: Double?
    public var lower95MetersPerSecond: Double?
    public var upper95MetersPerSecond: Double?
    public var confidence: Double
    public var status: WindEstimatorStatus
    public var reasons: [String]

    public init(
        speedMetersPerSecond: Double?,
        lower95MetersPerSecond: Double?,
        upper95MetersPerSecond: Double?,
        confidence: Double,
        status: WindEstimatorStatus,
        reasons: [String] = []
    ) {
        self.speedMetersPerSecond = speedMetersPerSecond
        self.lower95MetersPerSecond = lower95MetersPerSecond
        self.upper95MetersPerSecond = upper95MetersPerSecond
        self.confidence = confidence
        self.status = status
        self.reasons = reasons
    }
}

public struct DevicePersonalization: Codable, Equatable, Sendable {
    public var sampleCount: Int
    public var logBias: Double
    public var logGain: Double

    public init(sampleCount: Int = 0, logBias: Double = 0, logGain: Double = 1) {
        self.sampleCount = sampleCount
        self.logBias = logBias
        self.logGain = logGain
    }
}

public struct WindEstimator: Codable, Equatable, Sendable {
    public var priorModel: BayesianRidge
    public var personalizedModel: BayesianRidge
    public var personalizationByDevice: [String: DevicePersonalization]
    public var personalizationThreshold: Int
    public var maxConfidenceBandWidthMetersPerSecond: Double

    public init(
        priorModel: BayesianRidge = BayesianRidge(),
        personalizationThreshold: Int = 10,
        maxConfidenceBandWidthMetersPerSecond: Double = 4
    ) {
        self.priorModel = priorModel
        self.personalizedModel = BayesianRidge()
        self.personalizationByDevice = [:]
        self.personalizationThreshold = personalizationThreshold
        self.maxConfidenceBandWidthMetersPerSecond = maxConfidenceBandWidthMetersPerSecond
    }

    public mutating func fitPrior(samples: [BayesianRidgeSample]) throws {
        try priorModel.fit(samples)
    }

    public mutating func refitPersonalization(corrections: [CorrectionRecord], windows: [FeatureWindowRecord], deviceID: String) throws {
        let windowsBySession = Dictionary(grouping: windows, by: \.sessionID)
        let samples = corrections.compactMap { correction -> BayesianRidgeSample? in
            guard let featureVector = aggregateFeatureVector(windowsBySession[correction.sessionID] ?? []) else {
                return nil
            }
            return BayesianRidgeSample(features: featureVector, targetSpeedMetersPerSecond: correction.speedMetersPerSecond)
        }
        try personalizedModel.fit(samples)
        personalizationByDevice[deviceID] = fitBiasGain(corrections: corrections)
    }

    public func estimate<Feature>(feature: Feature, deviceID: String) -> WindEstimate {
        estimate(features: FeatureReflection.numericVector(from: feature), qualityFlags: FeatureReflection.stringFlags(from: feature), deviceID: deviceID)
    }

    public func estimate(features: [String: Double], qualityFlags: [String] = [], deviceID: String) -> WindEstimate {
        let rejectionFlags = qualityFlags.filter { flag in
            let lowered = flag.lowercased()
            return lowered.contains("clip")
                || lowered.contains("speech")
                || lowered.contains("handling")
                || lowered.contains("agc")
                || lowered.contains("reject")
        }
        guard rejectionFlags.isEmpty else {
            return WindEstimate(
                speedMetersPerSecond: nil,
                lower95MetersPerSecond: nil,
                upper95MetersPerSecond: nil,
                confidence: 0,
                status: .rejectedByQualityGate,
                reasons: rejectionFlags
            )
        }

        let device = personalizationByDevice[deviceID] ?? DevicePersonalization()
        let prediction: BayesianRidgePrediction?
        let baseStatus: WindEstimatorStatus
        if device.sampleCount >= personalizationThreshold, personalizedModel.isFitted {
            prediction = personalizedModel.predict(features: features)
            baseStatus = .personalized
        } else {
            prediction = priorModel.predict(features: features)
            baseStatus = .priorDominated
        }

        guard let prediction else {
            return WindEstimate(
                speedMetersPerSecond: nil,
                lower95MetersPerSecond: nil,
                upper95MetersPerSecond: nil,
                confidence: 0,
                status: .unavailable
            )
        }

        let adjusted = apply(device: device, to: prediction)
        let bandWidth = adjusted.upper95MetersPerSecond - adjusted.lower95MetersPerSecond
        let confidence = max(0, min(1, 1 - bandWidth / maxConfidenceBandWidthMetersPerSecond))
        let status: WindEstimatorStatus = bandWidth > maxConfidenceBandWidthMetersPerSecond ? .lowConfidence : baseStatus

        return WindEstimate(
            speedMetersPerSecond: status == .lowConfidence ? nil : adjusted.speedMetersPerSecond,
            lower95MetersPerSecond: status == .lowConfidence ? nil : adjusted.lower95MetersPerSecond,
            upper95MetersPerSecond: status == .lowConfidence ? nil : adjusted.upper95MetersPerSecond,
            confidence: confidence,
            status: status
        )
    }

    public func predictionSnapshot(from estimate: WindEstimate, shownAt: Date = Date()) -> PredictionSnapshot {
        PredictionSnapshot(
            speedMetersPerSecond: estimate.speedMetersPerSecond,
            lowerBoundMetersPerSecond: estimate.lower95MetersPerSecond,
            upperBoundMetersPerSecond: estimate.upper95MetersPerSecond,
            confidence: estimate.confidence,
            status: estimate.status.rawValue,
            shownAt: shownAt
        )
    }

    private func apply(device: DevicePersonalization, to prediction: BayesianRidgePrediction) -> BayesianRidgePrediction {
        guard device.sampleCount >= personalizationThreshold else { return prediction }
        let logMean = device.logBias + device.logGain * prediction.logMean
        let logVariance = prediction.logVariance * max(0.25, device.logGain * device.logGain)
        return BayesianRidgePrediction(logMean: logMean, logVariance: logVariance, epsilon: priorModel.epsilon)
    }

    private func fitBiasGain(corrections: [CorrectionRecord]) -> DevicePersonalization {
        let pairs = corrections.compactMap { correction -> (Double, Double)? in
            guard
                let shown = correction.predictionShown?.speedMetersPerSecond,
                shown > 0,
                correction.speedMetersPerSecond > 0
            else { return nil }
            return (log(shown + priorModel.epsilon), log(correction.speedMetersPerSecond + priorModel.epsilon))
        }
        guard pairs.count >= personalizationThreshold else {
            return DevicePersonalization(sampleCount: corrections.count)
        }
        let meanX = pairs.map(\.0).reduce(0, +) / Double(pairs.count)
        let meanY = pairs.map(\.1).reduce(0, +) / Double(pairs.count)
        let varianceX = pairs.map { pow($0.0 - meanX, 2) }.reduce(0, +)
        let covariance = pairs.map { ($0.0 - meanX) * ($0.1 - meanY) }.reduce(0, +)
        // Clamp: with few points a degenerate slope can send estimates to
        // absurd values; a real mic-response correction stays near 1.
        let rawGain = varianceX > 1.0e-9 ? covariance / varianceX : 1
        let gain = max(0.25, min(4.0, rawGain))
        let bias = meanY - gain * meanX
        return DevicePersonalization(sampleCount: corrections.count, logBias: bias, logGain: gain)
    }
}

public func aggregateFeatureVector(_ windows: [FeatureWindowRecord]) -> [String: Double]? {
    // Any quality flag (clipping/agc/speech/handling) means contamination —
    // only clean windows may train the model or feed estimates.
    let usable = windows.filter { $0.qualityFlags.isEmpty }
    guard !usable.isEmpty else { return nil }
    let keys = Array(Set(usable.flatMap { $0.featureVector.keys })).sorted()
    var output: [String: Double] = [:]
    for key in keys {
        let values = usable.compactMap { $0.featureVector[key] }.filter(\.isFinite)
        guard !values.isEmpty else { continue }
        output["mean.\(key)"] = values.reduce(0, +) / Double(values.count)
        output["median.\(key)"] = percentile(values, 0.5)
        output["p75.\(key)"] = percentile(values, 0.75)
        output["p90.\(key)"] = percentile(values, 0.9)
    }
    return output
}

public func correctionSummary(from windows: [FeatureWindowRecord], lockStability: Double? = nil) -> CorrectionSummary {
    let candidateKeys = ["windSpeedProxy", "speedProxy", "energy", "bandEnergy", "centroid"]
    let values = windows.flatMap { window in
        window.featureVector.compactMap { key, value in
            candidateKeys.contains(where: { key.lowercased().contains($0.lowercased()) }) ? value : nil
        }
    }.filter(\.isFinite)
    guard !values.isEmpty else {
        return CorrectionSummary(mean: 0, median: 0, p75: 0, p90: 0, gustVariance: 0, lockStability: lockStability)
    }
    let mean = values.reduce(0, +) / Double(values.count)
    let variance = values.map { pow($0 - mean, 2) }.reduce(0, +) / Double(values.count)
    return CorrectionSummary(
        mean: mean,
        median: percentile(values, 0.5),
        p75: percentile(values, 0.75),
        p90: percentile(values, 0.9),
        gustVariance: variance,
        lockStability: lockStability
    )
}

private func percentile(_ values: [Double], _ p: Double) -> Double {
    let sorted = values.sorted()
    guard let first = sorted.first else { return 0 }
    guard sorted.count > 1 else { return first }
    let clamped = max(0, min(1, p))
    let position = clamped * Double(sorted.count - 1)
    let lower = Int(floor(position))
    let upper = Int(ceil(position))
    if lower == upper { return sorted[lower] }
    let fraction = position - Double(lower)
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction
}
