import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '../constants/colors';
import { issueStore } from './index';

export default function Submit() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing fields', 'Please fill in both title and description.');
      return;
    }

    const issue = {
      id: Date.now().toString(),
      title: title.trim(),
      description: description.trim(),
      submittedAt: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    };

    issueStore.unshift(issue);
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.label}>WORLD ISSUE</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Global freshwater scarcity"
            placeholderTextColor={COLORS.dim}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />

          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Describe the problem, its scale, and why it matters..."
            placeholderTextColor={COLORS.dim}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>SUBMIT TO AGENT VOTE</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, gap: 8 },
  label: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 2,
    marginTop: 12,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    fontFamily: 'Courier',
    fontSize: 14,
    color: COLORS.text,
  },
  textarea: {
    minHeight: 140,
  },
  charCount: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    textAlign: 'right',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
  },
});
