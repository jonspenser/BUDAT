import XCTest
@testable import WindCore

final class FeatureExtractorTests: XCTestCase {
    private let sampleRate = 48_000.0
    private let windowDuration = 3.0

    private var windowSampleCount: Int {
        Int(sampleRate * windowDuration)
    }

    // MARK: - Synthetic signals

    private func uniformNoise(amplitude: Float, count: Int, seed: UInt64 = 1) -> [Float] {
        var state = seed
        return (0..<count).map { _ in
            // xorshift64 — deterministic across runs.
            state ^= state << 13
            state ^= state >> 7
            state ^= state << 17
            let unit = Float(state % 2_000_001) / 1_000_000 - 1
            return unit * amplitude
        }
    }

    private func tone(frequency: Double, amplitude: Float, count: Int) -> [Float] {
        (0..<count).map { index in
            amplitude * Float(sin(2 * .pi * frequency * Double(index) / sampleRate))
        }
    }

    private func sawtooth(frequency: Double, amplitude: Float, count: Int, harmonics: Int = 20) -> [Float] {
        var output = [Float](repeating: 0, count: count)
        for harmonic in 1...harmonics {
            let harmonicFrequency = frequency * Double(harmonic)
            guard harmonicFrequency < sampleRate / 2 else { break }
            for index in 0..<count {
                output[index] += amplitude / Float(harmonic)
                    * Float(sin(2 * .pi * harmonicFrequency * Double(index) / sampleRate))
            }
        }
        return output
    }

    // MARK: - Spectral features

    func testToneCentroidAndBandPlacement() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let features = extractor.extract(samples: tone(frequency: 800, amplitude: 0.3, count: windowSampleCount))

        XCTAssertEqual(features.spectralCentroid, 800, accuracy: 40)
        XCTAssertGreaterThan(features.bandEnergyHigh, features.bandEnergyLow * 10)
        XCTAssertGreaterThan(features.bandEnergyHigh, features.bandEnergyMid * 10)
        XCTAssertLessThan(features.spectralFlatness, 0.1, "pure tone should not look flat")
    }

    func testLowFrequencyToneLandsInLowBand() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let features = extractor.extract(samples: tone(frequency: 60, amplitude: 0.3, count: windowSampleCount))

        XCTAssertGreaterThan(features.bandEnergyLow, features.bandEnergyMid * 10)
        XCTAssertGreaterThan(features.ratioLowHigh, 10)
        XCTAssertFalse(features.quality.speechDetected, "60 Hz tone is below the speech centroid range")
    }

    func testBroadbandNoiseIsFlat() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let features = extractor.extract(samples: uniformNoise(amplitude: 0.1, count: windowSampleCount))

        XCTAssertGreaterThan(features.spectralFlatness, 0.5)
        XCTAssertTrue(features.quality.isUsable, "clean noise should pass every gate")
        XCTAssertGreaterThan(features.bandEnergyLow, 0)
        XCTAssertGreaterThan(features.bandEnergyMid, 0)
        XCTAssertGreaterThan(features.bandEnergyHigh, 0)
    }

    func testWindowMetadataPassthrough() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let features = extractor.extract(
            samples: uniformNoise(amplitude: 0.05, count: windowSampleCount),
            timeOffsetSeconds: 12.5,
            headingDegrees: 271
        )

        XCTAssertEqual(features.timeOffsetSeconds, 12.5)
        XCTAssertEqual(features.headingDegrees, 271)
        XCTAssertEqual(features.durationSeconds, windowDuration, accuracy: 0.001)
    }

    // MARK: - Gust variance

    func testGustVarianceRespondsToAmplitudeModulation() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let steady = uniformNoise(amplitude: 0.1, count: windowSampleCount)
        var gusty = uniformNoise(amplitude: 0.1, count: windowSampleCount, seed: 7)
        // 1 Hz square-wave amplitude modulation: alternating calm/gust.
        for index in 0..<gusty.count {
            let second = Int(Double(index) / sampleRate)
            if second % 2 == 1 {
                gusty[index] *= 4
            }
        }

        let steadyFeatures = extractor.extract(samples: steady)
        let gustyFeatures = extractor.extract(samples: gusty)
        XCTAssertGreaterThan(gustyFeatures.gustVariance, steadyFeatures.gustVariance * 10)
    }

    // MARK: - Quality gates

    func testClippingGate() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        var clipped = uniformNoise(amplitude: 0.3, count: windowSampleCount)
        for index in stride(from: 0, to: clipped.count, by: 100) {
            clipped[index] = 1.0
        }

        let features = extractor.extract(samples: clipped)
        XCTAssertTrue(features.quality.clipping)
        XCTAssertFalse(features.quality.isUsable)
    }

    func testSpeechGateFlagsVoicedSignal() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let voiced = sawtooth(frequency: 140, amplitude: 0.2, count: windowSampleCount)

        let features = extractor.extract(samples: voiced)
        XCTAssertTrue(features.quality.speechDetected)
        XCTAssertFalse(features.quality.isUsable)
    }

    func testSpeechGatePassesBroadbandNoise() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let features = extractor.extract(samples: uniformNoise(amplitude: 0.1, count: windowSampleCount))
        XCTAssertFalse(features.quality.speechDetected)
    }

    func testHandlingNoiseGateFlagsImpulses() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        var bumpy = uniformNoise(amplitude: 0.005, count: windowSampleCount)
        for index in stride(from: 4800, to: bumpy.count, by: 14_400) {
            bumpy[index] = 0.9
        }

        let features = extractor.extract(samples: bumpy)
        XCTAssertTrue(features.quality.handlingNoise)
        XCTAssertFalse(features.quality.isUsable)
    }

    func testAGCGateFlagsLevelJumpWithUnchangedSpectrum() {
        let extractor = FeatureExtractor(sampleRate: sampleRate)
        let quiet = uniformNoise(amplitude: 0.02, count: windowSampleCount)
        let loud = quiet.map { $0 * 16 }  // +24 dB step, identical shape

        let first = extractor.extract(samples: quiet)
        XCTAssertFalse(first.quality.agcSuspected, "first window has no baseline")

        let second = extractor.extract(samples: loud)
        XCTAssertTrue(second.quality.agcSuspected)
    }
}
