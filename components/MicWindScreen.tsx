import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { Theme } from '../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  theme: Theme;
  height?: number;
  active?: boolean;
}

export default function MicWindScreen({ theme, height }: Props) {
  return (
    <View style={{
      width: SCREEN_W,
      height,
      backgroundColor: theme.background,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text style={{ color: theme.muted, fontFamily: 'Courier', fontSize: 12, letterSpacing: 2 }}>
        MIC DISABLED · iOS 26
      </Text>
    </View>
  );
}
