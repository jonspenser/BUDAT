import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Transmission } from '../constants/types';
import { COLORS } from '../constants/colors';

interface LogEntryProps {
  transmission: Transmission;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${year} ${month} ${day} · ${hours}:${mins}`;
}

function formatArrivalDate(isoString: string): string {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  return `${year} ${month} ${day}`;
}

export function LogEntry({ transmission }: LogEntryProps) {
  const arrived = new Date(transmission.arrivalAt) <= new Date();
  const statusColor = arrived ? COLORS.logArrived : COLORS.logPending;
  const preview =
    transmission.message.length > 60
      ? transmission.message.slice(0, 60) + '...'
      : transmission.message;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={[styles.starName, { color: statusColor }]}>
          {transmission.starName.toUpperCase()}
        </Text>
        <Text style={[styles.distance, { color: statusColor }]}>
          {transmission.distanceLy.toFixed(2)} LY
        </Text>
      </View>
      <Text style={[styles.meta, { color: statusColor }]}>
        SENT: {formatDate(transmission.sentAt)}
      </Text>
      <View style={styles.arrivalRow}>
        <Text style={[styles.meta, { color: statusColor }]}>
          ARRIVAL: {formatArrivalDate(transmission.arrivalAt)}
        </Text>
        <Text style={[styles.badge, { color: statusColor, borderColor: statusColor }]}>
          {arrived ? 'ARRIVED' : 'IN FLIGHT'}
        </Text>
      </View>
      <Text style={[styles.message, { color: statusColor }]}>
        "{preview}"
      </Text>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  starName: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  distance: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: 'bold',
  },
  meta: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 2,
  },
  arrivalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    fontFamily: 'Courier',
    fontSize: 9,
    letterSpacing: 1,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  message: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
});
