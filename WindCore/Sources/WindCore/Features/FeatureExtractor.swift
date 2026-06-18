import Accelerate
import Foundation

/// Extracts the per-window acoustic feature set from a mono 48 kHz analysis
/// window: band energies (20–120 / 120–400 / 400–1200 Hz), band ratios,
/// spectral slope/centroid/flatness, and short-window gust variance.
/// Spectra are Welch-averaged over 8192-sample Hann segments (~5.9 Hz bins).
public final class FeatureExtractor {
    public struct BandEdges: Sendable {
        public var lowHz: ClosedRange<Double>
        public var midHz: ClosedRange<Double>
        public var highHz: ClosedRange<Double>

        public init(
            lowHz: ClosedRange<Double> = 20...120,
            midHz: ClosedRange<Double> = 120...400,
            highHz: ClosedRange<Double> = 400...1200
        ) {
            self.lowHz = lowHz
            self.midHz = midHz
            self.highHz = highHz
        }
    }

    public let sampleRate: Double
    public let bands: BandEdges
    public let qualityGates: QualityGates

    private let segmentLength = 8192
    private let segmentHop = 4096
    private let log2n: vDSP_Length = 13
    private let fftSetup: FFTSetup
    private let hannWindow: [Float]
    /// Sub-window length for gust variance (~250 ms of level fluctuation).
    private let gustSubWindowDuration: TimeInterval = 0.25
    private let epsilon = 1e-12

    public init(sampleRate: Double = 48_000, bands: BandEdges = BandEdges(), qualityGates: QualityGates = QualityGates()) {
        precondition(sampleRate > 0)
        self.sampleRate = sampleRate
        self.bands = bands
        self.qualityGates = qualityGates
        guard let setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
            preconditionFailure("vDSP_create_fftsetup failed")
        }
        fftSetup = setup
        var window = [Float](repeating: 0, count: segmentLength)
        vDSP_hann_window(&window, vDSP_Length(segmentLength), Int32(vDSP_HANN_NORM))
        hannWindow = window
    }

    deinit {
        vDSP_destroy_fftsetup(fftSetup)
    }

    public func extract(
        samples: [Float],
        timeOffsetSeconds: Double = 0,
        headingDegrees: Double? = nil
    ) -> WindowFeatures {
        let power = welchPowerSpectrum(samples)
        let hzPerBin = sampleRate / Double(segmentLength)

        let low = bandEnergy(power, hzPerBin: hzPerBin, band: bands.lowHz)
        let mid = bandEnergy(power, hzPerBin: hzPerBin, band: bands.midHz)
        let high = bandEnergy(power, hzPerBin: hzPerBin, band: bands.highHz)
        let total = low + mid + high

        let analysisBand = bands.lowHz.lowerBound...bands.highHz.upperBound
        let centroid = spectralCentroid(power, hzPerBin: hzPerBin, band: analysisBand)
        let flatness = spectralFlatness(power, hzPerBin: hzPerBin, band: analysisBand)
        let slope = spectralSlope(power, hzPerBin: hzPerBin, band: analysisBand)

        var rms: Float = 0
        vDSP_rmsqv(samples, 1, &rms, vDSP_Length(samples.count))
        var peakMagnitude: Float = 0
        vDSP_maxmgv(samples, 1, &peakMagnitude, vDSP_Length(samples.count))

        let quality = qualityGates.assess(QualityGates.Inputs(
            samples: samples,
            sampleRate: sampleRate,
            rms: Double(rms),
            peak: Double(peakMagnitude),
            spectralFlatness: flatness,
            spectralCentroid: centroid,
            lowBandRatio: total > epsilon ? low / total : 0
        ))

        return WindowFeatures(
            timeOffsetSeconds: timeOffsetSeconds,
            durationSeconds: Double(samples.count) / sampleRate,
            headingDegrees: headingDegrees,
            rms: Double(rms),
            bandEnergyLow: low,
            bandEnergyMid: mid,
            bandEnergyHigh: high,
            ratioLowMid: low / (mid + epsilon),
            ratioMidHigh: mid / (high + epsilon),
            ratioLowHigh: low / (high + epsilon),
            spectralSlope: slope,
            spectralCentroid: centroid,
            spectralFlatness: flatness,
            gustVariance: gustVariance(samples),
            quality: quality
        )
    }

    // MARK: - Spectrum

    /// Averaged one-sided power spectrum, `segmentLength / 2` bins.
    /// Windows shorter than one segment are zero-padded.
    func welchPowerSpectrum(_ samples: [Float]) -> [Double] {
        let halfLength = segmentLength / 2
        var accumulated = [Double](repeating: 0, count: halfLength)
        var segmentCount = 0

        var start = 0
        while start == 0 || start + segmentLength <= samples.count {
            var segment = [Float](repeating: 0, count: segmentLength)
            let available = min(segmentLength, samples.count - start)
            if available > 0 {
                segment.replaceSubrange(0..<available, with: samples[start..<(start + available)])
            }
            let power = segmentPowerSpectrum(segment)
            for bin in 0..<halfLength {
                accumulated[bin] += Double(power[bin])
            }
            segmentCount += 1
            start += segmentHop
        }

        let scale = 1.0 / Double(max(1, segmentCount))
        for bin in 0..<halfLength {
            accumulated[bin] *= scale
        }
        // Bin 0 packs DC + Nyquist in vDSP's real FFT layout; we never use
        // it (analysis starts at 20 Hz) so zero it to avoid surprises.
        accumulated[0] = 0
        return accumulated
    }

    private func segmentPowerSpectrum(_ segment: [Float]) -> [Float] {
        let halfLength = segmentLength / 2
        var windowed = [Float](repeating: 0, count: segmentLength)
        vDSP_vmul(segment, 1, hannWindow, 1, &windowed, 1, vDSP_Length(segmentLength))

        var real = [Float](repeating: 0, count: halfLength)
        var imaginary = [Float](repeating: 0, count: halfLength)
        var power = [Float](repeating: 0, count: halfLength)

        real.withUnsafeMutableBufferPointer { realPointer in
            imaginary.withUnsafeMutableBufferPointer { imaginaryPointer in
                var split = DSPSplitComplex(
                    realp: realPointer.baseAddress!,
                    imagp: imaginaryPointer.baseAddress!
                )
                windowed.withUnsafeBufferPointer { windowedPointer in
                    windowedPointer.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfLength) {
                        vDSP_ctoz($0, 2, &split, 1, vDSP_Length(halfLength))
                    }
                }
                vDSP_fft_zrip(fftSetup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                vDSP_zvmags(&split, 1, &power, 1, vDSP_Length(halfLength))
            }
        }

        let scale = Float(1.0 / Double(segmentLength))
        return power.map { $0 * scale }
    }

    private func binRange(hzPerBin: Double, band: ClosedRange<Double>) -> Range<Int> {
        let lower = max(1, Int((band.lowerBound / hzPerBin).rounded(.up)))
        let upper = min(segmentLength / 2, Int((band.upperBound / hzPerBin).rounded(.down)) + 1)
        return lower..<max(lower, upper)
    }

    private func bandEnergy(_ power: [Double], hzPerBin: Double, band: ClosedRange<Double>) -> Double {
        let range = binRange(hzPerBin: hzPerBin, band: band)
        guard !range.isEmpty else { return 0 }
        return power[range].reduce(0, +)
    }

    private func spectralCentroid(_ power: [Double], hzPerBin: Double, band: ClosedRange<Double>) -> Double {
        let range = binRange(hzPerBin: hzPerBin, band: band)
        var weighted = 0.0
        var total = 0.0
        for bin in range {
            let frequency = Double(bin) * hzPerBin
            weighted += frequency * power[bin]
            total += power[bin]
        }
        return total > epsilon ? weighted / total : 0
    }

    private func spectralFlatness(_ power: [Double], hzPerBin: Double, band: ClosedRange<Double>) -> Double {
        let range = binRange(hzPerBin: hzPerBin, band: band)
        guard !range.isEmpty else { return 0 }
        var logSum = 0.0
        var sum = 0.0
        for bin in range {
            let value = power[bin] + epsilon
            logSum += log(value)
            sum += value
        }
        let count = Double(range.count)
        let geometricMean = exp(logSum / count)
        let arithmeticMean = sum / count
        return arithmeticMean > epsilon ? geometricMean / arithmeticMean : 0
    }

    /// Least-squares slope of power (dB) against log10(frequency) — dB per
    /// decade. Turbulent wind noise falls off steeply; speech and tones do
    /// not follow a power law.
    private func spectralSlope(_ power: [Double], hzPerBin: Double, band: ClosedRange<Double>) -> Double {
        let range = binRange(hzPerBin: hzPerBin, band: band)
        guard range.count >= 2 else { return 0 }
        var sumX = 0.0, sumY = 0.0, sumXX = 0.0, sumXY = 0.0
        let count = Double(range.count)
        for bin in range {
            let x = log10(Double(bin) * hzPerBin)
            let y = 10 * log10(power[bin] + epsilon)
            sumX += x
            sumY += y
            sumXX += x * x
            sumXY += x * y
        }
        let denominator = count * sumXX - sumX * sumX
        guard abs(denominator) > epsilon else { return 0 }
        return (count * sumXY - sumX * sumY) / denominator
    }

    // MARK: - Gust variance

    /// Variance of short-sub-window RMS levels across the analysis window —
    /// captures gustiness as level fluctuation rather than mean level.
    func gustVariance(_ samples: [Float]) -> Double {
        let subLength = max(1, Int(gustSubWindowDuration * sampleRate))
        guard samples.count >= subLength * 2 else { return 0 }
        var levels: [Double] = []
        var start = 0
        while start + subLength <= samples.count {
            var rms: Float = 0
            samples[start..<(start + subLength)].withUnsafeBufferPointer { pointer in
                vDSP_rmsqv(pointer.baseAddress!, 1, &rms, vDSP_Length(subLength))
            }
            levels.append(Double(rms))
            start += subLength
        }
        let mean = levels.reduce(0, +) / Double(levels.count)
        return levels.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(levels.count)
    }
}
