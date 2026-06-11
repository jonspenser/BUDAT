#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(WindMeterModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startMeasuring:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopMeasuring:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(submitCorrection:(double)speedMS
                  unit:(NSString *)unit
                  readingType:(NSString *)readingType
                  directionDegrees:(nullable NSNumber *)directionDegrees
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
