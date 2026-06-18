import XCTest
@testable import WindCore

final class SampleStoreTests: XCTestCase {
    func testRoundTripSessionWindowAndCorrection() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = try SampleStore(url: directory.appendingPathComponent("samples.sqlite"))

        let session = SessionRecord(
            id: UUID(),
            startedAt: Date(timeIntervalSince1970: 100),
            deviceModel: "iPhone-test",
            osVersion: "26.0",
            audioRoute: "builtInMic",
            sampleRate: 48_000,
            bufferSize: 1024,
            sweepBins: [
                SweepBinRecord(headingDegrees: 10, energy: 0.2, smoothedEnergy: 0.25, sampleCount: 3)
            ],
            peakHeadingDegrees: 10,
            lobeClassification: .clean,
            lobeSharpness: 0.8,
            lobeSeparationDegrees: nil,
            lobeConfidence: 0.9,
            captureMetadataJSON: #"{"route":"builtInMic"}"#
        )
        try store.insertSession(session)

        let window = FeatureWindowRecord(
            id: UUID(),
            sessionID: session.id,
            capturedAt: Date(timeIntervalSince1970: 101),
            timeOffsetSeconds: 1,
            headingDegrees: 10,
            featureJSON: #"{"band120To400":2.0}"#,
            featureVector: ["band120To400": 2.0, "flatness": 0.3],
            qualityFlags: []
        )
        try store.insertFeatureWindow(window)

        let correction = CorrectionRecord(
            id: UUID(),
            sessionID: session.id,
            enteredSpeed: 12,
            unit: .knots,
            readingType: .sustained,
            observationStartedAt: Date(timeIntervalSince1970: 100),
            observationEndedAt: Date(timeIntervalSince1970: 120),
            anemometerType: "handheld",
            predictionShown: PredictionSnapshot(
                speedMetersPerSecond: 5,
                lowerBoundMetersPerSecond: 4,
                upperBoundMetersPerSecond: 6,
                confidence: 0.7,
                status: WindEstimatorStatus.priorDominated.rawValue,
                shownAt: Date(timeIntervalSince1970: 99)
            ),
            summary: CorrectionSummary(mean: 2, median: 2, p75: 2, p90: 2, gustVariance: 0.1),
            createdAt: Date(timeIntervalSince1970: 121)
        )
        try store.insertCorrection(correction)

        XCTAssertEqual(try store.sessions(), [session])
        XCTAssertEqual(try store.featureWindows(sessionID: session.id), [window])
        XCTAssertEqual(try store.corrections(sessionID: session.id), [correction])

        let exportURL = directory.appendingPathComponent("export.json")
        try store.exportSamples(to: exportURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: exportURL.path))
    }
}

