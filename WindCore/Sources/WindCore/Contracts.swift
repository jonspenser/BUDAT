import Foundation

// Shared contract types for WindCore. Both the capture/feature/direction side
// and the logging/model side code against these. Treat this file as the
// interface boundary: changes here must be coordinated (owned by Claude).

// MARK: - Capture metadata

/// Device and audio-route context recorded with every capture session.
/// Mic placement and iOS high-pass behavior vary across devices, so this
/// metadata must travel with every labeled sample.
public struct CaptureMetadata: Codable, Equatable, Sendable {
    public var deviceModel: String
    public var osVersion: String
    public var audioRoute: String
    public var inputOrientation: String?
    public var sampleRate: Double
    public var bufferSize: Int
    public var measurementModeActive: Bool
    public var capturedAt: Date

    public init(
        deviceModel: String,
        osVersion: String,
        audioRoute: String,
        inputOrientation: String? = nil,
        sampleRate: Double,
        bufferSize: Int,
        measurementModeActive: Bool = false,
        capturedAt: Date = Date()
    ) {
        self.deviceModel = deviceModel
        self.osVersion = osVersion
        self.audioRoute = audioRoute
        self.inputOrientation = inputOrientation
        self.sampleRate = sampleRate
        self.bufferSize = bufferSize
        self.measurementModeActive = measurementModeActive
        self.capturedAt = capturedAt
    }
}

// MARK: - Per-window quality assessment

/// Quality gates evaluated per analysis window. Any true flag means the
/// window is contaminated and must not be used for training or estimates.
public struct QualityAssessment: Codable, Equatable, Sendable {
    public var clipping: Bool
    public var agcSuspected: Bool
    public var speechDetected: Bool
    public var handlingNoise: Bool
    public var peakLevel: Double
    public var clippedFraction: Double

    public var isUsable: Bool {
        !(clipping || agcSuspected || speechDetected || handlingNoise)
    }

    public init(
        clipping: Bool = false,
        agcSuspected: Bool = false,
        speechDetected: Bool = false,
        handlingNoise: Bool = false,
        peakLevel: Double = 0,
        clippedFraction: Double = 0
    ) {
        self.clipping = clipping
        self.agcSuspected = agcSuspected
        self.speechDetected = speechDetected
        self.handlingNoise = handlingNoise
        self.peakLevel = peakLevel
        self.clippedFraction = clippedFraction
    }
}

// MARK: - Window features

/// One row of acoustic features for a single 2–5s analysis window.
/// Band edges: low 20–120 Hz (device-dependent below ~100 Hz due to iOS
/// high-pass behavior), mid 120–400 Hz, high 400–1200 Hz.
public struct WindowFeatures: Codable, Equatable, Sendable {
    public var timeOffsetSeconds: Double
    public var durationSeconds: Double
    public var headingDegrees: Double?

    public var rms: Double
    public var bandEnergyLow: Double
    public var bandEnergyMid: Double
    public var bandEnergyHigh: Double
    public var ratioLowMid: Double
    public var ratioMidHigh: Double
    public var ratioLowHigh: Double
    public var spectralSlope: Double
    public var spectralCentroid: Double
    public var spectralFlatness: Double
    public var gustVariance: Double

    public var quality: QualityAssessment

    /// Scalar wind-energy proxy used by the direction sweep (speech band
    /// excluded as much as possible by weighting the turbulence bands).
    public var windProxyEnergy: Double {
        bandEnergyLow + bandEnergyMid
    }

    public init(
        timeOffsetSeconds: Double,
        durationSeconds: Double,
        headingDegrees: Double? = nil,
        rms: Double,
        bandEnergyLow: Double,
        bandEnergyMid: Double,
        bandEnergyHigh: Double,
        ratioLowMid: Double,
        ratioMidHigh: Double,
        ratioLowHigh: Double,
        spectralSlope: Double,
        spectralCentroid: Double,
        spectralFlatness: Double,
        gustVariance: Double,
        quality: QualityAssessment = QualityAssessment()
    ) {
        self.timeOffsetSeconds = timeOffsetSeconds
        self.durationSeconds = durationSeconds
        self.headingDegrees = headingDegrees
        self.rms = rms
        self.bandEnergyLow = bandEnergyLow
        self.bandEnergyMid = bandEnergyMid
        self.bandEnergyHigh = bandEnergyHigh
        self.ratioLowMid = ratioLowMid
        self.ratioMidHigh = ratioMidHigh
        self.ratioLowHigh = ratioLowHigh
        self.spectralSlope = spectralSlope
        self.spectralCentroid = spectralCentroid
        self.spectralFlatness = spectralFlatness
        self.gustVariance = gustVariance
        self.quality = quality
    }
}

// MARK: - Direction sweep

public enum SweepLobeClassification: String, Codable, Sendable {
    case clean
    case flat
    case bimodal
    case insufficientData
}

public enum SweepGuidance: String, Codable, Sendable, CustomStringConvertible {
    case keepSweeping
    case rotateLeft
    case rotateRight
    case hold
    case locked
    case noLock

    public var description: String {
        switch self {
        case .keepSweeping: return "Keep sweeping"
        case .rotateLeft: return "Rotate left"
        case .rotateRight: return "Rotate right"
        case .hold: return "Hold steady"
        case .locked: return "Locked"
        case .noLock: return "No clear direction"
        }
    }
}

/// One circular heading bin from the guided sweep.
public struct SweepBin: Codable, Equatable, Sendable {
    /// Bin center heading in degrees [0, 360).
    public var headingDegrees: Double
    /// Mean raw wind-proxy energy observed in this bin.
    public var energy: Double
    /// Energy after circular kernel smoothing over angle.
    public var smoothedEnergy: Double
    public var sampleCount: Int

    public init(headingDegrees: Double, energy: Double, smoothedEnergy: Double, sampleCount: Int) {
        self.headingDegrees = headingDegrees
        self.energy = energy
        self.smoothedEnergy = smoothedEnergy
        self.sampleCount = sampleCount
    }
}

/// Snapshot of the sweep analysis after each heading/energy sample.
/// The lobe shape is the quality gate: a flat or bimodal energy-vs-angle
/// curve means no honest lock, and `isLocked` stays false.
public struct SweepResult: Codable, Equatable, Sendable {
    public var bins: [SweepBin]
    /// Fraction of heading bins with at least one sample.
    public var coverage: Double
    public var peakHeadingDegrees: Double?
    public var lobeClassification: SweepLobeClassification
    /// Peak-to-mean ratio of the smoothed lobe; higher is sharper.
    public var lobeSharpness: Double?
    /// Angular separation of the secondary lobe when bimodal.
    public var lobeSeparationDegrees: Double?
    /// Heading steadiness during the dwell phase, 0–1.
    public var lockStability: Double?
    /// Overall lobe quality, 0–1; combines sharpness and unimodality.
    public var lobeConfidence: Double?
    public var guidance: SweepGuidance
    public var isLocked: Bool
    /// Calibration context only — not ground truth for wind direction.
    public var lockedHeadingDegrees: Double?

    public init(
        bins: [SweepBin] = [],
        coverage: Double = 0,
        peakHeadingDegrees: Double? = nil,
        lobeClassification: SweepLobeClassification = .insufficientData,
        lobeSharpness: Double? = nil,
        lobeSeparationDegrees: Double? = nil,
        lockStability: Double? = nil,
        lobeConfidence: Double? = nil,
        guidance: SweepGuidance = .keepSweeping,
        isLocked: Bool = false,
        lockedHeadingDegrees: Double? = nil
    ) {
        self.bins = bins
        self.coverage = coverage
        self.peakHeadingDegrees = peakHeadingDegrees
        self.lobeClassification = lobeClassification
        self.lobeSharpness = lobeSharpness
        self.lobeSeparationDegrees = lobeSeparationDegrees
        self.lockStability = lockStability
        self.lobeConfidence = lobeConfidence
        self.guidance = guidance
        self.isLocked = isLocked
        self.lockedHeadingDegrees = lockedHeadingDegrees
    }
}
