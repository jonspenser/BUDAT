import React from 'react';
import { ScrollView, Pressable, View, Text, StyleSheet } from 'react-native';
import { Star } from '../constants/types';
import { COLORS } from '../constants/colors';

interface StarPickerProps {
  stars: Star[];
  selectedId: string;
  onSelect: (starId: string) => void;
}

export function StarPicker({ stars, selectedId, onSelect }: StarPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {stars.map(star => {
        const selected = star.id === selectedId;
        return (
          <Pressable
            key={star.id}
            onPress={() => onSelect(star.id)}
            style={[styles.card, selected ? styles.cardSelected : styles.cardUnselected]}
          >
            <Text style={[styles.name, selected ? styles.textSelected : styles.textDim]}>
              {star.name.toUpperCase()}
            </Text>
            <Text style={[styles.distance, selected ? styles.textSelected : styles.textDim]}>
              {star.distanceLy.toFixed(2)} LY
            </Text>
            <Text style={styles.spectral}>{star.spectralClass}</Text>
            <Text style={styles.constellation}>{star.constellation.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  card: {
    width: 120,
    padding: 10,
    borderWidth: 1,
    borderRadius: 2,
  },
  cardSelected: {
    backgroundColor: COLORS.starCardSelected,
    borderColor: COLORS.primary,
  },
  cardUnselected: {
    backgroundColor: COLORS.starCardBg,
    borderColor: COLORS.divider,
  },
  name: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  distance: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  spectral: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    marginBottom: 2,
  },
  constellation: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
  },
  textSelected: {
    color: COLORS.primary,
  },
  textDim: {
    color: COLORS.dim,
  },
});
