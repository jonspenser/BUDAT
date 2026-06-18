import Foundation

public enum WindSpeedUnit: String, Codable, CaseIterable, Sendable {
    case metersPerSecond
    case milesPerHour
    case knots
    case kilometersPerHour

    public func metersPerSecond(_ value: Double) -> Double {
        switch self {
        case .metersPerSecond:
            return value
        case .milesPerHour:
            return value * 0.44704
        case .knots:
            return value * 0.514444
        case .kilometersPerHour:
            return value / 3.6
        }
    }
}

public enum WindReadingType: String, Codable, CaseIterable, Sendable {
    case sustained
    case average
    case gust
}

public enum LobeClassification: String, Codable, Sendable {
    case clean
    case flat
    case bimodal
    case unknown
}

public struct SweepBinRecord: Codable, Equatable, Sendable {
    public var headingDegrees: Double
    public var energy: Double
    public var smoothedEnergy: Double
    public var sampleCount: Int

    public init(headingDegrees: Double, energy: Double, smoothedEnergy: Double, sampleCount: Int) {
        self.headingDegrees = headingDegrees
        self.energy = energy
        self.smoothedEnergy = smoothedEnergy
        self.sampleCount = sampleCount
    }
}

public struct SessionRecord: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var startedAt: Date
    public var endedAt: Date?
    public var deviceModel: String
    public var osVersion: String
    public var audioRoute: String
    public var sampleRate: Double
    public var bufferSize: Int
    public var sweepBins: [SweepBinRecord]
    public var peakHeadingDegrees: Double?
    public var lobeClassification: LobeClassification
    public var lobeSharpness: Double?
    public var lobeSeparationDegrees: Double?
    public var lobeConfidence: Double?
    public var captureMetadataJSON: String

    public init(
        id: UUID = UUID(),
        startedAt: Date = Date(),
        endedAt: Date? = nil,
        deviceModel: String,
        osVersion: String,
        audioRoute: String,
        sampleRate: Double,
        bufferSize: Int,
        sweepBins: [SweepBinRecord] = [],
        peakHeadingDegrees: Double? = nil,
        lobeClassification: LobeClassification = .unknown,
        lobeSharpness: Double? = nil,
        lobeSeparationDegrees: Double? = nil,
        lobeConfidence: Double? = nil,
        captureMetadataJSON: String = "{}"
    ) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.deviceModel = deviceModel
        self.osVersion = osVersion
        self.audioRoute = audioRoute
        self.sampleRate = sampleRate
        self.bufferSize = bufferSize
        self.sweepBins = sweepBins
        self.peakHeadingDegrees = peakHeadingDegrees
        self.lobeClassification = lobeClassification
        self.lobeSharpness = lobeSharpness
        self.lobeSeparationDegrees = lobeSeparationDegrees
        self.lobeConfidence = lobeConfidence
        self.captureMetadataJSON = captureMetadataJSON
    }
}

public struct FeatureWindowRecord: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var sessionID: UUID
    public var capturedAt: Date
    public var timeOffsetSeconds: Double
    public var headingDegrees: Double?
    public var featureJSON: String
    public var featureVector: [String: Double]
    public var qualityFlags: [String]

    public init(
        id: UUID = UUID(),
        sessionID: UUID,
        capturedAt: Date = Date(),
        timeOffsetSeconds: Double,
        headingDegrees: Double?,
        featureJSON: String,
        featureVector: [String: Double],
        qualityFlags: [String] = []
    ) {
        self.id = id
        self.sessionID = sessionID
        self.capturedAt = capturedAt
        self.timeOffsetSeconds = timeOffsetSeconds
        self.headingDegrees = headingDegrees
        self.featureJSON = featureJSON
        self.featureVector = featureVector
        self.qualityFlags = qualityFlags
    }
}

public struct CorrectionSummary: Codable, Equatable, Sendable {
    public var mean: Double
    public var median: Double
    public var p75: Double
    public var p90: Double
    public var gustVariance: Double
    public var lockStability: Double?

    public init(
        mean: Double,
        median: Double,
        p75: Double,
        p90: Double,
        gustVariance: Double,
        lockStability: Double? = nil
    ) {
        self.mean = mean
        self.median = median
        self.p75 = p75
        self.p90 = p90
        self.gustVariance = gustVariance
        self.lockStability = lockStability
    }
}

public struct PredictionSnapshot: Codable, Equatable, Sendable {
    public var speedMetersPerSecond: Double?
    public var lowerBoundMetersPerSecond: Double?
    public var upperBoundMetersPerSecond: Double?
    public var confidence: Double
    public var status: String
    public var shownAt: Date

    public init(
        speedMetersPerSecond: Double?,
        lowerBoundMetersPerSecond: Double?,
        upperBoundMetersPerSecond: Double?,
        confidence: Double,
        status: String,
        shownAt: Date = Date()
    ) {
        self.speedMetersPerSecond = speedMetersPerSecond
        self.lowerBoundMetersPerSecond = lowerBoundMetersPerSecond
        self.upperBoundMetersPerSecond = upperBoundMetersPerSecond
        self.confidence = confidence
        self.status = status
        self.shownAt = shownAt
    }
}

public struct CorrectionRecord: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var sessionID: UUID
    public var enteredSpeed: Double
    public var unit: WindSpeedUnit
    public var speedMetersPerSecond: Double
    public var readingType: WindReadingType
    public var observationStartedAt: Date
    public var observationEndedAt: Date
    public var anemometerType: String
    public var predictionShown: PredictionSnapshot?
    public var summary: CorrectionSummary
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        sessionID: UUID,
        enteredSpeed: Double,
        unit: WindSpeedUnit,
        readingType: WindReadingType,
        observationStartedAt: Date,
        observationEndedAt: Date,
        anemometerType: String,
        predictionShown: PredictionSnapshot?,
        summary: CorrectionSummary,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.sessionID = sessionID
        self.enteredSpeed = enteredSpeed
        self.unit = unit
        self.speedMetersPerSecond = unit.metersPerSecond(enteredSpeed)
        self.readingType = readingType
        self.observationStartedAt = observationStartedAt
        self.observationEndedAt = observationEndedAt
        self.anemometerType = anemometerType
        self.predictionShown = predictionShown
        self.summary = summary
        self.createdAt = createdAt
    }
}

public struct SampleExport: Codable, Equatable, Sendable {
    public var sessions: [SessionRecord]
    public var featureWindows: [FeatureWindowRecord]
    public var corrections: [CorrectionRecord]

    public init(
        sessions: [SessionRecord],
        featureWindows: [FeatureWindowRecord],
        corrections: [CorrectionRecord]
    ) {
        self.sessions = sessions
        self.featureWindows = featureWindows
        self.corrections = corrections
    }
}

