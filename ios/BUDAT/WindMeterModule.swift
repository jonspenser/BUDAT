import Foundation
import React
import WindCore

@objc(WindMeterModule)
final class WindMeterModule: RCTEventEmitter {
    private var controller: WindMeterController?
    private var hasListeners = false

    override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! {
        ["onSweepUpdate", "onEstimateUpdate", "onHeadingUpdate", "onError"]
    }

    override func startObserving() { hasListeners = true }
    override func stopObserving() { hasListeners = false }

    @objc func startMeasuring(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            let ctrl = WindMeterController()
            ctrl.onSweepUpdate = { [weak self] result, heading, levelDb in
                self?.sendSweepUpdate(result, currentHeadingDegrees: heading, levelDb: levelDb)
            }
            ctrl.onHeadingUpdate = { [weak self] heading in
                self?.sendHeadingUpdate(heading)
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

    @objc func submitCorrection(_ speedValue: Double,
                                unit: String,
                                readingType: String,
                                directionDegrees: NSNumber?,
                                resolver resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            guard let controller = self.controller else {
                reject("NOT_MEASURING", "Wind meter is not running — correction was not recorded", nil)
                return
            }
            controller.submitCorrection(
                speedValue: speedValue,
                unit: unit,
                readingType: readingType,
                directionDegrees: directionDegrees?.doubleValue
            )
            resolve(nil)
        }
    }

    @objc func exportCalibrationData(_ resolve: @escaping RCTPromiseResolveBlock,
                                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            // Works with or without an active measurement — a temporary
            // controller only opens the store, it doesn't start audio.
            let controller = self.controller ?? WindMeterController()
            do {
                let url = try controller.exportCalibrationData()
                resolve(url.path)
            } catch {
                reject("EXPORT_FAILED", error.localizedDescription, error)
            }
        }
    }

    // MARK: - Private

    private func sendSweepUpdate(_ result: SweepResult, currentHeadingDegrees: Double, levelDb: Double) {
        guard hasListeners else { return }
        var body: [String: Any] = [
            "guidance": result.guidance.rawValue,
            "isLocked": result.isLocked,
            "coverage": result.coverage,
            "lobeClassification": result.lobeClassification.rawValue,
            "currentHeadingDegrees": currentHeadingDegrees,
            "levelDb": levelDb,
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

    private func sendHeadingUpdate(_ heading: Double) {
        guard hasListeners else { return }
        sendEvent(withName: "onHeadingUpdate", body: ["headingDegrees": heading])
    }
}
