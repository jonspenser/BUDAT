import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Animated,
  Easing,
  Dimensions,
  StyleSheet,
} from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { COLORS } from '../constants/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface TransmitAnimationProps {
  visible: boolean;
  onComplete: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CX = SCREEN_W / 2;
const CY = SCREEN_H / 2;

export function TransmitAnimation({ visible, onComplete }: TransmitAnimationProps) {
  const ring1Radius = useRef(new Animated.Value(0)).current;
  const ring1Opacity = useRef(new Animated.Value(1)).current;
  const ring2Radius = useRef(new Animated.Value(0)).current;
  const ring2Opacity = useRef(new Animated.Value(1)).current;
  const ring3Radius = useRef(new Animated.Value(0)).current;
  const ring3Opacity = useRef(new Animated.Value(1)).current;
  const beamY = useRef(new Animated.Value(0)).current;
  const beamOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Reset all values
    ring1Radius.setValue(0);
    ring1Opacity.setValue(1);
    ring2Radius.setValue(0);
    ring2Opacity.setValue(1);
    ring3Radius.setValue(0);
    ring3Opacity.setValue(1);
    beamY.setValue(0);
    beamOpacity.setValue(0);
    textOpacity.setValue(0);

    const ringAnim = (radius: Animated.Value, opacity: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(radius, {
            toValue: 160,
            duration: 800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
      ]);

    Animated.parallel([
      ringAnim(ring1Radius, ring1Opacity, 0),
      ringAnim(ring2Radius, ring2Opacity, 200),
      ringAnim(ring3Radius, ring3Opacity, 400),
      Animated.sequence([
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(beamOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(beamY, {
            toValue: -SCREEN_H,
            duration: 1000,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setTimeout(onComplete, 600);
    });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <Svg
          width={SCREEN_W}
          height={SCREEN_H}
          style={StyleSheet.absoluteFill}
        >
          {/* Expanding rings */}
          <AnimatedCircle
            cx={CX}
            cy={CY}
            r={ring1Radius as unknown as number}
            stroke={COLORS.primary}
            strokeWidth={1.5}
            fill="none"
            opacity={ring1Opacity as unknown as number}
          />
          <AnimatedCircle
            cx={CX}
            cy={CY}
            r={ring2Radius as unknown as number}
            stroke={COLORS.primary}
            strokeWidth={1.5}
            fill="none"
            opacity={ring2Opacity as unknown as number}
          />
          <AnimatedCircle
            cx={CX}
            cy={CY}
            r={ring3Radius as unknown as number}
            stroke={COLORS.primary}
            strokeWidth={1}
            fill="none"
            opacity={ring3Opacity as unknown as number}
          />
        </Svg>

        {/* Beam */}
        <Animated.View
          style={[
            styles.beamGlow,
            {
              opacity: beamOpacity,
              transform: [{ translateY: beamY }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.beam,
            {
              opacity: beamOpacity,
              transform: [{ translateY: beamY }],
            },
          ]}
        />

        {/* Transmitted label */}
        <Animated.Text style={[styles.transmittedText, { opacity: textOpacity }]}>
          SIGNAL TRANSMITTED
        </Animated.Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beamGlow: {
    position: 'absolute',
    width: 16,
    top: CY,
    bottom: 0,
    backgroundColor: COLORS.transmitGlow,
    opacity: 0.25,
    alignSelf: 'center',
  },
  beam: {
    position: 'absolute',
    width: 3,
    top: CY,
    bottom: 0,
    backgroundColor: COLORS.transmitBeam,
    alignSelf: 'center',
  },
  transmittedText: {
    fontFamily: 'Courier',
    fontSize: 14,
    color: COLORS.primary,
    letterSpacing: 4,
    textAlign: 'center',
  },
});
