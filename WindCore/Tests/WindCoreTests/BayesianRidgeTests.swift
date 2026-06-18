import XCTest
@testable import WindCore

final class BayesianRidgeTests: XCTestCase {
    func testRecoversKnownPowerLaw() throws {
        var samples: [BayesianRidgeSample] = []
        for index in 1...80 {
            let energy = Double(index) / 8.0
            let speed = 1.8 * pow(energy, 0.62)
            samples.append(
                BayesianRidgeSample(
                    features: ["logEnergy": log(energy), "flatness": 0.2],
                    targetSpeedMetersPerSecond: speed
                )
            )
        }

        var model = BayesianRidge(epsilon: 0.05, priorPrecision: 0.1, noisePrecision: 100)
        try model.fit(samples)

        let prediction = try XCTUnwrap(model.predict(features: ["logEnergy": log(6.0), "flatness": 0.2]))
        let expected = 1.8 * pow(6.0, 0.62)
        XCTAssertEqual(prediction.speedMetersPerSecond, expected, accuracy: 0.35)
    }

    func testPosteriorVarianceShrinksWithMoreData() throws {
        let small = (1...4).map { index in
            BayesianRidgeSample(features: ["x": Double(index)], targetSpeedMetersPerSecond: Double(index) * 0.8 + 2)
        }
        let large = (1...60).map { index in
            BayesianRidgeSample(features: ["x": Double(index)], targetSpeedMetersPerSecond: Double(index) * 0.8 + 2)
        }

        var smallModel = BayesianRidge(noisePrecision: 50)
        var largeModel = BayesianRidge(noisePrecision: 50)
        try smallModel.fit(small)
        try largeModel.fit(large)

        let smallPrediction = try XCTUnwrap(smallModel.predict(features: ["x": 8]))
        let largePrediction = try XCTUnwrap(largeModel.predict(features: ["x": 8]))
        XCTAssertLessThan(largePrediction.logVariance, smallPrediction.logVariance)
    }
}

