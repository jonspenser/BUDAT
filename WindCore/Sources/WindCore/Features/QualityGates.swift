import Accelerate
import Foundation

/// Per-window contamination checks. A window failing any gate is logged with
/// the corresponding flag set and must be excluded from training and from
/// live estimates (the estimator rejects on these flag names).
///
/// Stateful: AGC detection compares consecutive windows, so feed windows in
/// capture order and `reset()` between sessions.
public final class QualityGates {
    public struct Thresholds: Sendable {
        /// Sample magnitude treated as clipped.
        public var clipLevel: Double = 0.985
        /// Fraction of clipped samples above which the window is rejected.
        public var clipFraction: Double = 0.0005
        /// RMS level step between consecutive windows that suggests an AGC
        /// gain change rather than a real wind change (dB).
        public var agcJumpDB: Double = 9
        /// Spectral-shape change below which a big level step looks like
        /// gain riding instead of new content.
        public var agcFlatnessDelta: Double = 0.12
        /// Voiced speech: strong pitch periodicity in the 70–400 Hz range…
        public var speechPeriodicityMin: Double = 0.45
        /// …combined with a tonal (non-flat) spectrum…
        public var speechFlatnessMax: Double = 0.25
        /// …and a centroid in the speech band.
        public var speechCentroidHz: ClosedRange<Double> = 120...3000
        /// Peak-to-RMS ratio above which the window looks like handling
        /// bumps/scrapes rather than stationary wind noise.
        public var handlingCrestFactor: Double = 8

        public init() {}
    }

    public struct Inputs {
        public var samples: [Float]
        public var sampleRate: Double
        public var rms: Double
        public var peak: Double
        public var spectralFlatness: Double
        public var spectralCentroid: Double
        public var lowBandRatio: Double

        public init(
            samples: [Float],
            sampleRate: Double,
            rms: Double,
            peak: Double,
            spectralFlatness: Double,
            spectralCentroid: Double,
            lowBandRatio: Double
        ) {
            self.samples = samples
            self.sampleRate = sampleRate
            self.rms = rms
            self.peak = peak
            self.spectralFlatness = spectralFlatness
            self.spectralCentroid = spectralCentroid
            self.lowBandRatio = lowBandRatio
        }
    }

    public let thresholds: Thresholds

    private var previousRMSdB: Double?
    private var previousFlatness: Double?
    private let epsilon = 1e-12

    public init(thresholds: Thresholds = Thresholds()) {
        self.thresholds = thresholds
    }

    public func reset() {
        previousRMSdB = nil
        previousFlatness = nil
    }

    public func assess(_ inputs: Inputs) -> QualityAssessment {
        let clippedFraction = Self.clippedFraction(inputs.samples, level: Float(thresholds.clipLevel))
        let clipping = clippedFraction > thresholds.clipFraction

        let rmsDB = 20 * log10(inputs.rms + epsilon)
        var agcSuspected = false
        if let previousRMSdB, let previousFlatness {
            // A large level step with an almost unchanged spectral shape is
            // characteristic of system gain changes; real wind changes move
            // the spectrum too.
            agcSuspected = abs(rmsDB - previousRMSdB) > thresholds.agcJumpDB
                && abs(inputs.spectralFlatness - previousFlatness) < thresholds.agcFlatnessDelta
        }
        previousRMSdB = rmsDB
        previousFlatness = inputs.spectralFlatness

        var speechDetected = false
        if inputs.spectralFlatness < thresholds.speechFlatnessMax,
           thresholds.speechCentroidHz.contains(inputs.spectralCentroid) {
            let periodicity = Self.pitchPeriodicity(inputs.samples, sampleRate: inputs.sampleRate)
            speechDetected = periodicity > thresholds.speechPeriodicityMin
        }

        let crest = inputs.peak / (inputs.rms + epsilon)
        let handlingNoise = crest > thresholds.handlingCrestFactor

        return QualityAssessment(
            clipping: clipping,
            agcSuspected: agcSuspected,
            speechDetected: speechDetected,
            handlingNoise: handlingNoise,
            peakLevel: inputs.peak,
            clippedFraction: clippedFraction
        )
    }

    static func clippedFraction(_ samples: [Float], level: Float) -> Double {
        guard !samples.isEmpty else { return 0 }
        var clipped = 0
        for sample in samples where abs(sample) >= level {
            clipped += 1
        }
        return Double(clipped) / Double(samples.count)
    }

    /// Normalized autocorrelation peak over pitch lags for 70–400 Hz.
    /// Voiced speech scores high; broadband wind noise scores low.
    static func pitchPeriodicity(_ samples: [Float], sampleRate: Double) -> Double {
        let maxLag = Int(sampleRate / 70)
        let minLag = Int(sampleRate / 400)
        let analysisLength = min(samples.count, 8192)
        guard analysisLength > maxLag + minLag, minLag > 0 else { return 0 }

        let segment = Array(samples.prefix(analysisLength))
        var mean: Float = 0
        vDSP_meanv(segment, 1, &mean, vDSP_Length(analysisLength))
        var negativeMean = -mean
        var centered = [Float](repeating: 0, count: analysisLength)
        vDSP_vsadd(segment, 1, &negativeMean, &centered, 1, vDSP_Length(analysisLength))

        let windowLength = analysisLength - maxLag
        var reference: Float = 0
        vDSP_dotpr(centered, 1, centered, 1, &reference, vDSP_Length(windowLength))
        guard reference > 0 else { return 0 }

        var best: Float = 0
        centered.withUnsafeBufferPointer { pointer in
            let base = pointer.baseAddress!
            for lag in minLag...maxLag {
                var value: Float = 0
                vDSP_dotpr(base, 1, base + lag, 1, &value, vDSP_Length(windowLength))
                if value > best {
                    best = value
                }
            }
        }
        return Double(best / reference)
    }
}
