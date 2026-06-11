import Foundation
import React
import WindCore

@objc(WindMeterModule)
final class WindMeterModule: RCTEventEmitter {
    private var controller: WindMeterController?
    private var hasListeners = false

    override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! {
        ["onSweepUpdate", "onEstimateUpdate", "onError"]
    }

    override func startObserving() { hasListeners = true }
    override func stopObserving() { hasListeners = false }

    @objc func startMeasuring(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            let ctrl = WindMeterController()
            ctrl.onSweepUpdate = { [weak self] result in
                self?.sendSweepUpdate(result)
            }
            ctrl.onEstimateUpdate = { [weak self] estimate in
                self?.sendEstimateUpdate(estimate)
            }
            do {
                try ctrl.start()
                self.controller = ctrl
                resolve(nil)
            } catch {
                reject("START_FAILED", error.localizedDescription, error)
            }
        }
    }

    @objc func stopMeasuring(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            self.controller?.stop()
            self.controller = nil
            resolve(nil)
        }
    }

    @objc func submitCorrection(_ speedMS: Double,
                                unit: String,
                                readingType: String,
                                directionDegrees: NSNumber?,
                                resolver resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            self.controller?.submitCorrection(
                speedMS: speedMS,
                unit: unit,
                readingType: readingType,
                directionDegrees: directionDegrees?.doubleValue
            )
            resolve(nil)
        }
    }

    // MARK: - Private

    private func sendSweepUpdate(_ result: SweepResult) {
        guard hasListeners else { return }
        var body: [String: Any] = [
            "guidance": result.guidance.rawValue,
            "isLocked": result.isLocked,
            "coverage": result.coverage,
            "lobeClassification": result.lobeClassification.rawValue,
        ]
        if let peak = result.peakHeadingDegrees { body["peakHeadingDegrees"] = peak }
        if let locked = result.lockedHeadingDegrees { body["lockedHeadingDegrees"] = locked }
        sendEvent(withName: "onSweepUpdate", body: body)
    }

    private func sendEstimateUpdate(_ estimate: WindEstimate) {
        guard hasListeners else { return }
        var body: [String: Any] = [
            "confidence": estimate.confidence,
            "status": estimate.status.rawValue,
        ]
        if let speed = estimate.speedMetersPerSecond { body["speedMS"] = speed }
        if let lower = estimate.lower95MetersPerSecond { body["lower95MS"] = lower }
        if let upper = estimate.upper95MetersPerSecond { body["upper95MS"] = upper }
        sendEvent(withName: "onEstimateUpdate", body: body)
    }
}
