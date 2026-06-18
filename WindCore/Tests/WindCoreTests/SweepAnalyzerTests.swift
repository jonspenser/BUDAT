import XCTest
@testable import WindCore

final class SweepAnalyzerTests: XCTestCase {
    /// Energy model: baseline plus a Gaussian lobe centered on `lobeHeading`.
    private func lobeEnergy(heading: Double, lobeHeading: Double, amplitude: Double = 4, sigma: Double = 40) -> Double {
        let delta = SweepAnalyzer.shortestAngle(from: heading, to: lobeHeading)
        return 1 + amplitude * exp(-(delta * delta) / (2 * sigma * sigma))
    }

    /// Simulates a slow full rotation at `rate` samples per second.
    @discardableResult
    private func runSweep(
        analyzer: SweepAnalyzer,
        energy: (Double) -> Double,
        startTime: TimeInterval = 0,
        duration: TimeInterval = 36,
        rate: Double = 10
    ) -> SweepResult {
        var result = SweepResult()
        let steps = Int(duration * rate)
        for step in 0...steps {
            let time = startTime + Double(step) / rate
            let heading = SweepAnalyzer.normalizeDegrees(360 * Double(step) / Double(steps))
            result = analyzer.ingest(headingDegrees: heading, energy: energy(heading), timestamp: time)
        }
        return result
    }

    // MARK: - Lobe classification

    func testCleanLobeIsDetectedWithPeakNearTruth() {
        let analyzer = SweepAnalyzer()
        let result = runSweep(analyzer: analyzer) { self.lobeEnergy(heading: $0, lobeHeading: 90) }

        XCTAssertEqual(result.lobeClassification, .clean)
        XCTAssertNotNil(result.peakHeadingDegrees)
        XCTAssertLessThan(
            abs(SweepAnalyzer.shortestAngle(from: result.peakHeadingDegrees ?? 0, to: 90)),
            15
        )
        XCTAssertGreaterThan(result.coverage, 0.9)
        XCTAssertGreaterThan(result.lobeConfidence ?? 0, 0)
        XCTAssertFalse(result.isLocked, "sweep alone must not lock; dwell is required")
    }

    func testFlatResponseNeverLocks() {
        let analyzer = SweepAnalyzer()
        let result = runSweep(analyzer: analyzer) { _ in 1.0 }

        XCTAssertEqual(result.lobeClassification, .flat)
        XCTAssertFalse(result.isLocked)
        XCTAssertEqual(result.guidance, .noLock)
        XCTAssertEqual(result.lobeConfidence ?? -1, 0)
    }

    func testBimodalResponseNeverLocks() {
        let analyzer = SweepAnalyzer()
        let result = runSweep(analyzer: analyzer) { heading in
            self.lobeEnergy(heading: heading, lobeHeading: 90, amplitude: 6, sigma: 30)
                + self.lobeEnergy(heading: heading, lobeHeading: 270, amplitude: 6, sigma: 30) - 1
        }

        XCTAssertEqual(result.lobeClassification, .bimodal)
        XCTAssertFalse(result.isLocked)
        XCTAssertGreaterThan(result.lobeSeparationDegrees ?? 0, 90)
        XCTAssertEqual(result.guidance, .noLock)
    }

    func testInsufficientCoverageReportsInsufficientData() {
        let analyzer = SweepAnalyzer()
        // Only a 60° arc swept.
        var result = SweepResult()
        for step in 0...60 {
            let heading = Double(step)
            result = analyzer.ingest(
                headingDegrees: heading,
                energy: lobeEnergy(heading: heading, lobeHeading: 30),
                timestamp: Double(step) * 0.1
            )
        }

        XCTAssertEqual(result.lobeClassification, .insufficientData)
        XCTAssertEqual(result.guidance, .keepSweeping)
        XCTAssertLessThan(result.coverage, 0.3)
    }

    // MARK: - Guidance and lock state machine

    func testGuidanceDirectsTowardPeakThenLocksAfterDwell() {
        let analyzer = SweepAnalyzer()
        let energy: (Double) -> Double = { self.lobeEnergy(heading: $0, lobeHeading: 90) }
        var result = runSweep(analyzer: analyzer, energy: energy)

        // Sweep ends at heading 0 (= 360), peak at 90: shortest path is a
        // clockwise rotation.
        result = analyzer.ingest(headingDegrees: 0, energy: energy(0), timestamp: 37)
        XCTAssertEqual(result.guidance, .rotateRight)

        // Walk back toward the peak.
        var time: TimeInterval = 37
        var heading = 0.0
        while abs(SweepAnalyzer.shortestAngle(from: heading, to: 90)) > 5 {
            heading += 5
            time += 0.1
            result = analyzer.ingest(headingDegrees: heading, energy: energy(heading), timestamp: time)
        }
        XCTAssertEqual(result.guidance, .hold, "inside tolerance the user should hold")
        XCTAssertFalse(result.isLocked)

        // Hold (with small heading jitter) past the dwell duration.
        for step in 1...40 {
            time += 0.1
            let jitter = Double(step % 5) - 2
            result = analyzer.ingest(headingDegrees: 90 + jitter, energy: energy(90), timestamp: time)
        }

        XCTAssertTrue(result.isLocked)
        XCTAssertEqual(result.guidance, .locked)
        XCTAssertLessThan(
            abs(SweepAnalyzer.shortestAngle(from: result.lockedHeadingDegrees ?? 0, to: 90)),
            10
        )
        XCTAssertGreaterThan(result.lockStability ?? 0, 0.5)
    }

    func testLeavingToleranceDuringDwellResetsToGuidance() {
        let analyzer = SweepAnalyzer()
        let energy: (Double) -> Double = { self.lobeEnergy(heading: $0, lobeHeading: 180) }
        runSweep(analyzer: analyzer, energy: energy)

        // Enter dwell on the peak…
        var result = analyzer.ingest(headingDegrees: 180, energy: energy(180), timestamp: 37)
        XCTAssertEqual(result.guidance, .hold)

        // …then swing far off before the dwell completes.
        result = analyzer.ingest(headingDegrees: 250, energy: energy(250), timestamp: 37.5)
        XCTAssertFalse(result.isLocked)
        XCTAssertEqual(result.guidance, .rotateLeft, "peak is counter-clockwise from 250°")
    }

    func testResetClearsAllState() {
        let analyzer = SweepAnalyzer()
        runSweep(analyzer: analyzer) { self.lobeEnergy(heading: $0, lobeHeading: 90) }
        analyzer.reset()

        let result = analyzer.currentResult
        XCTAssertEqual(result.coverage, 0)
        XCTAssertFalse(result.isLocked)
        XCTAssertNil(result.lockedHeadingDegrees)
        XCTAssertEqual(result.lobeClassification, .insufficientData)
    }

    // MARK: - Circular math

    func testShortestAngleWrapsCorrectly() {
        XCTAssertEqual(SweepAnalyzer.shortestAngle(from: 350, to: 10), 20, accuracy: 1e-9)
        XCTAssertEqual(SweepAnalyzer.shortestAngle(from: 10, to: 350), -20, accuracy: 1e-9)
        XCTAssertEqual(SweepAnalyzer.shortestAngle(from: 0, to: 180), 180, accuracy: 1e-9)
    }

    func testCircularMeanAcrossWrap() {
        let mean = SweepAnalyzer.circularMean([350, 10])
        XCTAssertLessThan(abs(SweepAnalyzer.shortestAngle(from: mean, to: 0)), 1e-6)
    }
}

final class SampleWindowerTests: XCTestCase {
    func testEmitsOverlappingWindowsWithCorrectOffsets() {
        let windower = SampleWindower(sampleRate: 100, windowDuration: 1.0, hopDuration: 0.5)
        var emitted: [(count: Int, offset: Double)] = []
        windower.onWindow = { samples, offset in
            emitted.append((samples.count, offset))
        }

        // 250 samples = 2.5 s: windows at 0.0, 0.5, 1.0, 1.5 s.
        windower.append(Array(repeating: Float(0), count: 250))

        XCTAssertEqual(emitted.count, 4)
        XCTAssertTrue(emitted.allSatisfy { $0.count == 100 })
        XCTAssertEqual(emitted.map(\.offset), [0.0, 0.5, 1.0, 1.5])
    }

    func testAccumulatesAcrossSmallAppends() {
        let windower = SampleWindower(sampleRate: 100, windowDuration: 1.0, hopDuration: 1.0)
        var windows = 0
        windower.onWindow = { _, _ in windows += 1 }

        for _ in 0..<30 {
            windower.append(Array(repeating: Float(0), count: 10))
        }
        XCTAssertEqual(windows, 3)
    }
}
