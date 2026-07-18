import XCTest
@testable import WindCore

final class DefaultPriorTests: XCTestCase {
    func testDefaultPriorProducesSpeedsAcrossTheCurve() {
        let estimator = WindEstimator.withDefaultPrior()
        let knotsToMS = 0.514444
        // (dBFS, expected knots) — vertices of the reference curve
        let expectations: [(db: Double, knots: Double)] = [
            (-58, 0), (-43, 1), (-35, 4), (-28, 7),
            (-21, 11), (-12, 17), (-5, 22), (-2, 28), (0, 34),
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
}
