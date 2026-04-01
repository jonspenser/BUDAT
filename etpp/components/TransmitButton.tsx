import React, { useEffect, useRef } from 'react';
import { Pressable, Text, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

interface TransmitButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function TransmitButton({ onPress, disabled = false }: TransmitButtonProps) {
  const pulse = useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    if (disabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.04,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, pulse]);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: pulse }] }]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.button, disabled && styles.buttonDisabled]}
      >
        <Text style={[styles.label, disabled && styles.labelDisabled]}>
          [ TRANSMIT ]
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
  },
  button: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    borderColor: COLORS.divider,
    opacity: 0.3,
  },
  label: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 4,
  },
  labelDisabled: {
    color: COLORS.dim,
  },
});
