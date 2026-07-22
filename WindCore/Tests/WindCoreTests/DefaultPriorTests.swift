import XCTest
@testable import WindCore

final class DefaultPriorTests: XCTestCase {
    func testDefaultPriorProducesSpeedsAcrossTheCurve() {
        let estimator = WindEstimator.withDefaultPrior()
        let knotsToMS = 0.514444
        // (dBFS, expected knots) — linear from -58dB→3kt to 0dB→30kt
        let expectations: [(db: Double, knots: Double)] = [
            (-58, 3), (-43, 9.75), (-29, 15.75), (-14, 22.5), (0, 30),
        ]
        for (db, expectedKnots) in expectations {
            let rms = pow(10, db / 20)
            let estimate = estimator.estimate(features: ["rms": rms], deviceID: "test")
            let speed = try! XCTUnwrap(estimate.speedMetersPerSecond,
                                       "no speed at \(db) dB")
            let knots = speed / knotsToMS
            let tolerance = max(2.5, expectedKnots * 0.25)
            XCTAssertEqual(knots, expectedKnots, accuracy: tolerance,
                           "prediction at \(db) dB strayed from the reference curve")
        }
    }

    func testDefaultPriorStaysWithinThreeToThirtyKnots() {
        let estimator = WindEstimator.withDefaultPrior()
        let knotsToMS = 0.514444
        for db in stride(from: -80.0, through: 10.0, by: 5.0) {
            let estimate = estimator.estimate(features: ["rmsDb": db], deviceID: "test")
            let speed = try! XCTUnwrap(estimate.speedMetersPerSecond)
            let knots = speed / knotsToMS
            XCTAssertGreaterThanOrEqual(knots, 2, "below the 3kt floor at \(db) dB: \(knots)kt")
            XCTAssertLessThanOrEqual(knots, 31, "above the 30kt ceiling at \(db) dB: \(knots)kt")
        }
    }

    func testDefaultPriorIsMonotonicInLevel() {
        let estimator = WindEstimator.withDefaultPrior()
        var previous = -Double.infinity
        for db in stride(from: -65.0, through: 0.0, by: 5.0) {
            let estimate = estimator.estimate(features: ["rmsDb": db], deviceID: "test")
            let speed = try! XCTUnwrap(estimate.speedMetersPerSecond)
            XCTAssertGreaterThanOrEqual(speed, previous - 0.01, "not monotonic at \(db) dB")
            previous = speed
        }
    }

    /// `WindMeterController.latestEstimate()` never feeds a flat "rms"/"rmsDb"
    /// key — it always goes through `aggregateFeatureVector`, which prefixes
    /// every key ("mean.rms", "median.rms", …). Regression for the bug where
    /// that prefix mismatch silently zeroed the level feature and pinned
    /// every live reading to the same ~34kt (0 dBFS) prediction.
    func testDefaultPriorRespondsToAggregatedRmsKeys() {
        let estimator = WindEstimator.withDefaultPrior()
        let knotsToMS = 0.514444
        var previousKnots = -Double.infinity
        for db in stride(from: -60.0, through: -5.0, by: 10.0) {
            let rms = pow(10, db / 20)
            let estimate = estimator.estimate(
                features: ["mean.rms": rms, "median.rms": rms, "p75.rms": rms, "p90.rms": rms],
                deviceID: "test"
            )
            let speed = try! XCTUnwrap(estimate.speedMetersPerSecond, "no speed at \(db) dB")
            let knots = speed / knotsToMS
            XCTAssertGreaterThan(knots, previousKnots + 0.5, "estimate did not vary with level at \(db) dB")
            previousKnots = knots
        }
    }
}
