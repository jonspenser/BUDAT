import Foundation

/// Scan-first direction finder. The user performs a guided slow sweep while
/// we accumulate wind-proxy energy into 10° circular heading bins; once
/// coverage is sufficient we smooth over angle, classify the lobe shape,
/// and only for a clean unimodal lobe guide the user back to the peak for a
/// dwell-and-lock refinement. Flat or bimodal lobes never lock — the lobe
/// shape is the honesty gate.
///
/// Pure logic: feed `ingest(headingDegrees:energy:timestamp:)` from any
/// heading source (see `DeviceHeadingProvider`) and render the returned
/// `SweepResult` in the UI.
public final class SweepAnalyzer {
    public struct Configuration: Sendable {
        public var binWidthDegrees: Double = 10
        /// Gaussian smoothing kernel width over angle.
        public var smoothingSigmaDegrees: Double = 20
        /// Bin coverage needed before we attempt lobe classification.
        public var minCoverage: Double = 0.65
        /// Coverage at which a still-unclean lobe becomes a hard "no lock".
        public var failCoverage: Double = 0.95
        /// How close to the peak counts as "on target" during refinement.
        public var lockToleranceDegrees: Double = 15
        /// How long the user must hold on the peak before we lock.
        public var dwellDuration: TimeInterval = 2.5
        /// Smoothed peak-to-mean ratio below which the lobe is flat.
        public var flatSharpnessThreshold: Double = 1.4
        /// Secondary/primary energy ratio above which the lobe is bimodal.
        public var bimodalRatio: Double = 0.7
        /// Minimum angular separation for a secondary lobe to count.
        public var bimodalMinSeparationDegrees: Double = 60

        public init() {}
    }

    private enum Phase {
        case sweeping
        case returningToPeak
        case dwelling(start: TimeInterval)
        case locked
        case failed
    }

    public let configuration: Configuration

    private let binCount: Int
    private var binEnergySums: [Double]
    private var binSampleCounts: [Int]
    private var phase: Phase = .sweeping
    private var dwellHeadings: [Double] = []
    private var lockedHeading: Double?
    private var lockStability: Double?
    private var lastResult = SweepResult()

    public init(configuration: Configuration = Configuration()) {
        precondition(configuration.binWidthDegrees > 0 && configuration.binWidthDegrees <= 120)
        self.configuration = configuration
        self.binCount = max(1, Int((360 / configuration.binWidthDegrees).rounded()))
        self.binEnergySums = Array(repeating: 0, count: binCount)
        self.binSampleCounts = Array(repeating: 0, count: binCount)
    }

    public var currentResult: SweepResult { lastResult }

    public func reset() {
        binEnergySums = Array(repeating: 0, count: binCount)
        binSampleCounts = Array(repeating: 0, count: binCount)
        phase = .sweeping
        dwellHeadings.removeAll()
        lockedHeading = nil
        lockStability = nil
        lastResult = SweepResult()
    }

    /// Feed one heading/energy observation. `energy` should be a wind-proxy
    /// scalar (e.g. `WindowFeatures.windProxyEnergy`) from an uncontaminated
    /// window; skip windows rejected by the quality gates.
    @discardableResult
    public func ingest(headingDegrees: Double, energy: Double, timestamp: TimeInterval) -> SweepResult {
        let heading = Self.normalizeDegrees(headingDegrees)
        let bin = min(binCount - 1, Int(heading / configuration.binWidthDegrees))
        binEnergySums[bin] += max(0, energy)
        binSampleCounts[bin] += 1

        let bins = makeBins()
        let coverage = Double(binSampleCounts.filter { $0 > 0 }.count) / Double(binCount)
        let analysis = classifyLobe(bins: bins, coverage: coverage)

        advancePhase(heading: heading, timestamp: timestamp, analysis: analysis, coverage: coverage)

        let isLocked: Bool
        let guidance: SweepGuidance
        switch phase {
        case .sweeping:
            isLocked = false
            guidance = .keepSweeping
        case .returningToPeak:
            isLocked = false
            if let peak = analysis.peakHeading {
                guidance = Self.shortestAngle(from: heading, to: peak) >= 0 ? .rotateRight : .rotateLeft
            } else {
                guidance = .keepSweeping
            }
        case .dwelling:
            isLocked = false
            guidance = .hold
        case .locked:
            isLocked = true
            guidance = .locked
        case .failed:
            isLocked = false
            guidance = .noLock
        }

        lastResult = SweepResult(
            bins: bins,
            coverage: coverage,
            peakHeadingDegrees: analysis.peakHeading,
            lobeClassification: analysis.classification,
            lobeSharpness: analysis.sharpness,
            lobeSeparationDegrees: analysis.separationDegrees,
            lockStability: lockStability,
            lobeConfidence: analysis.confidence,
            guidance: guidance,
            isLocked: isLocked,
            lockedHeadingDegrees: lockedHeading
        )
        return lastResult
    }

    // MARK: - State machine

    private func advancePhase(heading: Double, timestamp: TimeInterval, analysis: LobeAnalysis, coverage: Double) {
        switch phase {
        case .sweeping:
            if analysis.classification == .clean {
                phase = .returningToPeak
            } else if coverage >= configuration.failCoverage, analysis.classification != .insufficientData {
                phase = .failed
            }

        case .returningToPeak:
            guard analysis.classification == .clean, let peak = analysis.peakHeading else {
                phase = coverage >= configuration.failCoverage ? .failed : .sweeping
                return
            }
            if abs(Self.shortestAngle(from: heading, to: peak)) <= configuration.lockToleranceDegrees {
                phase = .dwelling(start: timestamp)
                dwellHeadings = [heading]
            }

        case .dwelling(let start):
            guard analysis.classification == .clean, let peak = analysis.peakHeading else {
                phase = .sweeping
                dwellHeadings.removeAll()
                return
            }
            if abs(Self.shortestAngle(from: heading, to: peak)) > configuration.lockToleranceDegrees {
                phase = .returningToPeak
                dwellHeadings.removeAll()
                return
            }
            dwellHeadings.append(heading)
            if timestamp - start >= configuration.dwellDuration {
                lockedHeading = Self.circularMean(dwellHeadings)
                let spread = Self.circularStandardDeviation(dwellHeadings)
                lockStability = max(0, min(1, 1 - spread / configuration.lockToleranceDegrees))
                phase = .locked
            }

        case .locked:
            break

        case .failed:
            // More sweeping can still rescue a noisy scan.
            if analysis.classification == .clean {
                phase = .returningToPeak
            }
        }
    }

    // MARK: - Lobe analysis

    private struct LobeAnalysis {
        var classification: SweepLobeClassification
        var peakHeading: Double?
        var sharpness: Double?
        var separationDegrees: Double?
        var confidence: Double?
    }

    private func makeBins() -> [SweepBin] {
        let smoothed = smoothedEnergies()
        return (0..<binCount).map { index in
            let count = binSampleCounts[index]
            return SweepBin(
                headingDegrees: (Double(index) + 0.5) * configuration.binWidthDegrees,
                energy: count > 0 ? binEnergySums[index] / Double(count) : 0,
                smoothedEnergy: smoothed[index],
                sampleCount: count
            )
        }
    }

    /// Gaussian kernel over wrapped angular distance, weighting only
    /// observed bins so empty bins don't drag the curve toward zero.
    private func smoothedEnergies() -> [Double] {
        let sigma = configuration.smoothingSigmaDegrees
        var smoothed = [Double](repeating: 0, count: binCount)
        for target in 0..<binCount {
            let targetAngle = (Double(target) + 0.5) * configuration.binWidthDegrees
            var weightedSum = 0.0
            var weightTotal = 0.0
            for source in 0..<binCount where binSampleCounts[source] > 0 {
                let sourceAngle = (Double(source) + 0.5) * configuration.binWidthDegrees
                let delta = Self.shortestAngle(from: targetAngle, to: sourceAngle)
                let weight = exp(-(delta * delta) / (2 * sigma * sigma))
                weightedSum += weight * (binEnergySums[source] / Double(binSampleCounts[source]))
                weightTotal += weight
            }
            smoothed[target] = weightTotal > 0 ? weightedSum / weightTotal : 0
        }
        return smoothed
    }

    private func classifyLobe(bins: [SweepBin], coverage: Double) -> LobeAnalysis {
        guard coverage >= configuration.minCoverage else {
            return LobeAnalysis(classification: .insufficientData)
        }

        let smoothed = bins.map(\.smoothedEnergy)
        guard let peakValue = smoothed.max(), peakValue > 0,
              let peakIndex = smoothed.firstIndex(of: peakValue) else {
            return LobeAnalysis(classification: .flat, sharpness: 1, confidence: 0)
        }

        let observed = bins.filter { $0.sampleCount > 0 }.map(\.smoothedEnergy)
        let mean = observed.reduce(0, +) / Double(observed.count)
        let sharpness = mean > 0 ? peakValue / mean : 0
        let peakHeading = refinedPeakHeading(smoothed: smoothed, peakIndex: peakIndex)

        if sharpness < configuration.flatSharpnessThreshold {
            return LobeAnalysis(
                classification: .flat,
                peakHeading: peakHeading,
                sharpness: sharpness,
                confidence: 0
            )
        }

        // Strongest energy well away from the primary peak: a true secondary
        // lobe there means front/back ambiguity and no honest lock.
        var secondaryValue = 0.0
        var secondaryIndex: Int?
        for (index, bin) in bins.enumerated() {
            let separation = abs(Self.shortestAngle(from: bin.headingDegrees, to: peakHeading))
            if separation >= configuration.bimodalMinSeparationDegrees, bin.smoothedEnergy > secondaryValue {
                secondaryValue = bin.smoothedEnergy
                secondaryIndex = index
            }
        }
        let secondaryRatio = secondaryValue / peakValue

        let sharpnessScore = max(0, min(1, (sharpness - 1) / configuration.flatSharpnessThreshold))
        let unimodalScore = max(0, min(1, 1 - secondaryRatio))
        let confidence = sharpnessScore * unimodalScore

        if secondaryRatio >= configuration.bimodalRatio, let secondaryIndex {
            let separation = abs(Self.shortestAngle(
                from: bins[secondaryIndex].headingDegrees,
                to: peakHeading
            ))
            return LobeAnalysis(
                classification: .bimodal,
                peakHeading: peakHeading,
                sharpness: sharpness,
                separationDegrees: separation,
                confidence: confidence
            )
        }

        return LobeAnalysis(
            classification: .clean,
            peakHeading: peakHeading,
            sharpness: sharpness,
            confidence: confidence
        )
    }

    /// Parabolic interpolation across the peak bin and its neighbors for a
    /// sub-bin heading estimate.
    private func refinedPeakHeading(smoothed: [Double], peakIndex: Int) -> Double {
        let center = (Double(peakIndex) + 0.5) * configuration.binWidthDegrees
        let left = smoothed[(peakIndex + binCount - 1) % binCount]
        let middle = smoothed[peakIndex]
        let right = smoothed[(peakIndex + 1) % binCount]
        let denominator = left - 2 * middle + right
        guard abs(denominator) > 1e-12 else { return center }
        let offset = 0.5 * (left - right) / denominator
        let clamped = max(-0.5, min(0.5, offset))
        return Self.normalizeDegrees(center + clamped * configuration.binWidthDegrees)
    }

    // MARK: - Circular math

    static func normalizeDegrees(_ degrees: Double) -> Double {
        var value = degrees.truncatingRemainder(dividingBy: 360)
        if value < 0 { value += 360 }
        return value
    }

    /// Signed shortest rotation from `from` to `to`, in (-180, 180].
    static func shortestAngle(from: Double, to: Double) -> Double {
        var delta = (to - from).truncatingRemainder(dividingBy: 360)
        if delta > 180 { delta -= 360 }
        if delta <= -180 { delta += 360 }
        return delta
    }

    static func circularMean(_ degrees: [Double]) -> Double {
        guard !degrees.isEmpty else { return 0 }
        var sine = 0.0
        var cosine = 0.0
        for value in degrees {
            let radians = value * .pi / 180
            sine += sin(radians)
            cosine += cos(radians)
        }
        return normalizeDegrees(atan2(sine, cosine) * 180 / .pi)
    }

    static func circularStandardDeviation(_ degrees: [Double]) -> Double {
        guard degrees.count > 1 else { return 0 }
        var sine = 0.0
        var cosine = 0.0
        for value in degrees {
            let radians = value * .pi / 180
            sine += sin(radians)
            cosine += cos(radians)
        }
        let resultantLength = sqrt(sine * sine + cosine * cosine) / Double(degrees.count)
        guard resultantLength > 1e-12 else { return 180 }
        guard resultantLength < 1 else { return 0 }
        return sqrt(-2 * log(resultantLength)) * 180 / .pi
    }
}

#if os(iOS) && canImport(CoreMotion)
import CoreMotion

/// CoreMotion heading source feeding `SweepAnalyzer.ingest`. Uses device
/// motion referenced to magnetic north; heading is degrees [0, 360).
public final class DeviceHeadingProvider {
    private let manager = CMMotionManager()
    public var onHeading: ((Double, TimeInterval) -> Void)?

    public init() {}

    public var isAvailable: Bool {
        manager.isDeviceMotionAvailable
    }

    public func start(updateInterval: TimeInterval = 1.0 / 30.0) {
        guard manager.isDeviceMotionAvailable else { return }
        manager.deviceMotionUpdateInterval = updateInterval
        manager.startDeviceMotionUpdates(using: .xMagneticNorthZVertical, to: .main) { [weak self] motion, _ in
            guard let motion, motion.heading >= 0 else { return }
            self?.onHeading?(motion.heading, motion.timestamp)
        }
    }

    public func stop() {
        manager.stopDeviceMotionUpdates()
    }
}
#endif
