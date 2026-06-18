import Foundation

public struct BayesianRidgeSample: Equatable, Sendable {
    public var features: [String: Double]
    public var targetSpeedMetersPerSecond: Double

    public init(features: [String: Double], targetSpeedMetersPerSecond: Double) {
        self.features = features
        self.targetSpeedMetersPerSecond = targetSpeedMetersPerSecond
    }
}

public struct BayesianRidgePrediction: Equatable, Sendable {
    public var logMean: Double
    public var logVariance: Double
    public var speedMetersPerSecond: Double
    public var lower95MetersPerSecond: Double
    public var upper95MetersPerSecond: Double

    public init(logMean: Double, logVariance: Double, epsilon: Double) {
        self.logMean = logMean
        self.logVariance = max(0, logVariance)
        self.speedMetersPerSecond = max(0, exp(logMean) - epsilon)
        let spread = 1.96 * sqrt(max(0, logVariance))
        self.lower95MetersPerSecond = max(0, exp(logMean - spread) - epsilon)
        self.upper95MetersPerSecond = max(0, exp(logMean + spread) - epsilon)
    }
}

public struct BayesianRidge: Codable, Equatable, Sendable {
    public private(set) var featureNames: [String]
    public private(set) var means: [Double]
    public private(set) var standardDeviations: [Double]
    public private(set) var coefficients: [Double]
    public private(set) var posteriorCovariance: [[Double]]
    public private(set) var residualVariance: Double
    public var epsilon: Double
    public var priorPrecision: Double
    public var noisePrecision: Double

    public init(
        epsilon: Double = 0.1,
        priorPrecision: Double = 1.0,
        noisePrecision: Double = 25.0
    ) {
        self.featureNames = []
        self.means = []
        self.standardDeviations = []
        self.coefficients = []
        self.posteriorCovariance = []
        self.residualVariance = 1
        self.epsilon = epsilon
        self.priorPrecision = priorPrecision
        self.noisePrecision = noisePrecision
    }

    public var isFitted: Bool {
        !coefficients.isEmpty
    }

    public mutating func fit(_ samples: [BayesianRidgeSample]) throws {
        let usableSamples = samples.filter { $0.targetSpeedMetersPerSecond.isFinite && $0.targetSpeedMetersPerSecond >= 0 }
        guard !usableSamples.isEmpty else {
            reset()
            return
        }

        featureNames = Array(Set(usableSamples.flatMap { $0.features.keys })).sorted()
        let rawX = usableSamples.map { sample in
            featureNames.map { sanitized(sample.features[$0] ?? 0) }
        }
        means = columnMeans(rawX)
        standardDeviations = columnStandardDeviations(rawX, means: means)

        let standardizedX = rawX.map { row in
            zip(zip(row, means), standardDeviations).map { pair, sd in
                sd > 0 ? (pair.0 - pair.1) / sd : 0
            }
        }
        let design = standardizedX.map { [1.0] + $0 }
        let y = usableSamples.map { log($0.targetSpeedMetersPerSecond + epsilon) }

        let xt = transpose(design)
        let xtx = multiply(xt, design)
        let dimension = xtx.count
        var precision = scale(xtx, by: noisePrecision)
        for i in 0..<dimension {
            precision[i][i] += i == 0 ? 1.0e-6 : priorPrecision
        }

        posteriorCovariance = invert(precision) ?? identity(dimension, diagonal: 1.0e6)
        let xty = multiply(xt, y).map { $0 * noisePrecision }
        coefficients = multiply(posteriorCovariance, xty)

        let residuals = zip(design, y).map { row, target in
            target - dot(row, coefficients)
        }
        let denominator = max(1, residuals.count - coefficients.count)
        let empiricalVariance = residuals.map { $0 * $0 }.reduce(0, +) / Double(denominator)
        residualVariance = max(empiricalVariance, 1.0 / max(noisePrecision, 1.0e-9))
    }

    public func predict(features: [String: Double]) -> BayesianRidgePrediction? {
        guard isFitted else { return nil }
        let row = featureNames.enumerated().map { index, name -> Double in
            let value = sanitized(features[name] ?? 0)
            let sd = standardDeviations[index]
            return sd > 0 ? (value - means[index]) / sd : 0
        }
        let design = [1.0] + row
        let mean = dot(design, coefficients)
        let parameterVariance = quadraticForm(design, posteriorCovariance)
        return BayesianRidgePrediction(
            logMean: mean,
            logVariance: residualVariance + parameterVariance,
            epsilon: epsilon
        )
    }

    public func predict<Feature>(feature: Feature) -> BayesianRidgePrediction? {
        predict(features: FeatureReflection.numericVector(from: feature))
    }

    private mutating func reset() {
        featureNames = []
        means = []
        standardDeviations = []
        coefficients = []
        posteriorCovariance = []
        residualVariance = 1
    }
}

private func sanitized(_ value: Double) -> Double {
    guard value.isFinite else { return 0 }
    return value
}

private func columnMeans(_ matrix: [[Double]]) -> [Double] {
    guard let width = matrix.first?.count else { return [] }
    return (0..<width).map { column in
        matrix.map { $0[column] }.reduce(0, +) / Double(matrix.count)
    }
}

private func columnStandardDeviations(_ matrix: [[Double]], means: [Double]) -> [Double] {
    guard !matrix.isEmpty else { return [] }
    return means.enumerated().map { column, mean in
        let variance = matrix.map { pow($0[column] - mean, 2) }.reduce(0, +) / Double(max(1, matrix.count - 1))
        return max(sqrt(variance), 1.0e-9)
    }
}

private func transpose(_ matrix: [[Double]]) -> [[Double]] {
    guard let width = matrix.first?.count else { return [] }
    return (0..<width).map { column in matrix.map { $0[column] } }
}

private func multiply(_ a: [[Double]], _ b: [[Double]]) -> [[Double]] {
    guard let bWidth = b.first?.count else { return [] }
    let bT = transpose(b)
    return a.map { row in
        (0..<bWidth).map { column in dot(row, bT[column]) }
    }
}

private func multiply(_ matrix: [[Double]], _ vector: [Double]) -> [Double] {
    matrix.map { dot($0, vector) }
}

private func scale(_ matrix: [[Double]], by scalar: Double) -> [[Double]] {
    matrix.map { row in row.map { $0 * scalar } }
}

private func dot(_ a: [Double], _ b: [Double]) -> Double {
    zip(a, b).map(*).reduce(0, +)
}

private func quadraticForm(_ vector: [Double], _ matrix: [[Double]]) -> Double {
    dot(vector, multiply(matrix, vector))
}

private func identity(_ size: Int, diagonal: Double = 1) -> [[Double]] {
    (0..<size).map { row in
        (0..<size).map { column in row == column ? diagonal : 0 }
    }
}

private func invert(_ matrix: [[Double]]) -> [[Double]]? {
    let n = matrix.count
    guard n > 0, matrix.allSatisfy({ $0.count == n }) else { return nil }

    var a = matrix
    var inverse = identity(n)

    for pivotIndex in 0..<n {
        var pivotRow = pivotIndex
        var pivotValue = abs(a[pivotIndex][pivotIndex])
        for row in pivotIndex..<n where abs(a[row][pivotIndex]) > pivotValue {
            pivotRow = row
            pivotValue = abs(a[row][pivotIndex])
        }
        guard pivotValue > 1.0e-12 else { return nil }
        if pivotRow != pivotIndex {
            a.swapAt(pivotRow, pivotIndex)
            inverse.swapAt(pivotRow, pivotIndex)
        }

        let pivot = a[pivotIndex][pivotIndex]
        for column in 0..<n {
            a[pivotIndex][column] /= pivot
            inverse[pivotIndex][column] /= pivot
        }

        for row in 0..<n where row != pivotIndex {
            let factor = a[row][pivotIndex]
            guard factor != 0 else { continue }
            for column in 0..<n {
                a[row][column] -= factor * a[pivotIndex][column]
                inverse[row][column] -= factor * inverse[pivotIndex][column]
            }
        }
    }

    return inverse
}
