import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { StarPicker } from '../components/StarPicker';
import { COLORS } from '../constants/colors';
import { STARS } from '../constants/stars';

const MAX_CHARS = 140;

export default function ComposeScreen() {
  const [message, setMessage] = useState('');
  const [selectedStarId, setSelectedStarId] = useState<string>(STARS[0].id);
  const [focused, setFocused] = useState(false);

  const remaining = MAX_CHARS - message.length;
  const canTransmit = message.trim().length > 0;

  function handleEncode() {
    router.push({
      pathname: '/signal',
      params: { message, starId: selectedStarId },
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor="#000000" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>ETPP</Text>
            <Text style={styles.subtitle}>EXTRA TERRESTRIAL PEN PAL</Text>
          </View>
          <Pressable onPress={() => router.push('/log')}>
            <Text style={styles.logLink}>LOG →</Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* Compose section */}
        <Text style={styles.sectionLabel}>COMPOSE MESSAGE</Text>
        <TextInput
          style={[
            styles.input,
            focused && styles.inputFocused,
          ]}
          value={message}
          onChangeText={setMessage}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="WHAT WOULD YOU SAY?"
          placeholderTextColor={COLORS.dim}
          multiline
          maxLength={MAX_CHARS}
          scrollEnabled
          textAlignVertical="top"
        />
        <Text style={[styles.charCount, remaining <= 20 ? styles.charCountWarn : null]}>
          {remaining} / {MAX_CHARS} CHARS REMAINING
        </Text>

        <View style={styles.divider} />

        {/* Star picker section */}
        <Text style={styles.sectionLabel}>SELECT DESTINATION</Text>
        <StarPicker
          stars={STARS}
          selectedId={selectedStarId}
          onSelect={setSelectedStarId}
        />

        <View style={styles.divider} />

        {/* Encode button */}
        <Pressable
          onPress={handleEncode}
          disabled={!canTransmit}
          style={[styles.encodeButton, !canTransmit && styles.encodeButtonDisabled]}
        >
          <Text style={[styles.encodeLabel, !canTransmit && styles.encodeLabelDisabled]}>
            ENCODE SIGNAL
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 4,
  },
  subtitle: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  logLink: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 12,
  },
  sectionLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  input: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginHorizontal: 16,
    padding: 12,
    minHeight: 120,
    letterSpacing: 1,
  },
  inputFocused: {
    borderColor: COLORS.inputFocus,
  },
  charCount: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 1,
    textAlign: 'right',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  charCountWarn: {
    color: COLORS.primary,
  },
  encodeButton: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  encodeButtonDisabled: {
    borderColor: COLORS.divider,
    opacity: 0.3,
  },
  encodeLabel: {
    fontFamily: 'Courier',
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 4,
  },
  encodeLabelDisabled: {
    color: COLORS.dim,
  },
});
