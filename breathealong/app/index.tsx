import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../constants/colors';
import { SongInput, SongInputMethod } from '../constants/types';
import { fetchSpotifyTrack } from '../services/spotify';
import { estimateBPM, fileNameToTitle } from '../services/audioAnalysis';

// Simple in-memory store passed to generate screen via params
export type SongPayload = {
  title: string;
  artist: string;
  bpm?: number;
  energy?: number;
  valence?: number;
  fileUri?: string;
};

export default function Home() {
  const router = useRouter();
  const [method, setMethod] = useState<SongInputMethod>('name');
  const [songName, setSongName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [fileInfo, setFileInfo] = useState<{ uri: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      setFileInfo({ uri: result.assets[0].uri, name: result.assets[0].name });
    }
  }

  async function handleStart() {
    setLoading(true);
    try {
      let payload: SongPayload;

      if (method === 'name') {
        if (!songName.trim()) { Alert.alert('Enter a song name'); return; }
        payload = {
          title: songName.trim(),
          artist: artistName.trim() || 'Unknown Artist',
        };
      } else if (method === 'spotify') {
        if (!spotifyUrl.trim()) { Alert.alert('Paste a Spotify link'); return; }
        const info = await fetchSpotifyTrack(spotifyUrl.trim());
        payload = { title: info.title, artist: info.artist, bpm: info.bpm, energy: info.energy, valence: info.valence };
      } else {
        if (!fileInfo) { Alert.alert('Pick an audio file first'); return; }
        const bpm = await estimateBPM(fileInfo.uri);
        payload = {
          title: fileNameToTitle(fileInfo.name),
          artist: 'Unknown Artist',
          bpm,
          fileUri: fileInfo.uri,
        };
      }

      router.push({ pathname: '/generate', params: payload as any });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: SongInputMethod; label: string }[] = [
    { key: 'name', label: '✏️  TYPE' },
    { key: 'spotify', label: '🎧  SPOTIFY' },
    { key: 'file', label: '📁  FILE' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logo}>BREATHE</Text>
          <Text style={styles.logoAccent}>ALONG</Text>
        </View>
        <Text style={styles.tagline}>AI-guided breathing • synced to your music</Text>

        <View style={styles.divider} />

        {/* Method tabs */}
        <View style={styles.tabs}>
          {tabs.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, method === t.key && styles.tabActive]}
              onPress={() => setMethod(t.key)}
            >
              <Text style={[styles.tabText, method === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input area */}
        {method === 'name' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>SONG TITLE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Weightless by Marconi Union"
              placeholderTextColor={COLORS.dim}
              value={songName}
              onChangeText={setSongName}
            />
            <Text style={styles.label}>ARTIST  <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Marconi Union"
              placeholderTextColor={COLORS.dim}
              value={artistName}
              onChangeText={setArtistName}
            />
          </View>
        )}

        {method === 'spotify' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>SPOTIFY LINK</Text>
            <TextInput
              style={styles.input}
              placeholder="https://open.spotify.com/track/..."
              placeholderTextColor={COLORS.dim}
              value={spotifyUrl}
              onChangeText={setSpotifyUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Paste a Spotify track URL. For BPM + energy data, add your Spotify API keys in .env.
            </Text>
          </View>
        )}

        {method === 'file' && (
          <View style={styles.inputGroup}>
            <TouchableOpacity style={styles.fileButton} onPress={pickFile}>
              <Text style={styles.fileButtonText}>
                {fileInfo ? `✓  ${fileInfo.name}` : '+ PICK AUDIO FILE'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>MP3, WAV, M4A supported. BPM will be estimated automatically.</Text>
          </View>
        )}

        {/* Start */}
        <TouchableOpacity style={styles.startButton} onPress={handleStart} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.startText}>▶  GENERATE BREATHING PATTERN</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 24, gap: 16 },

  logoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 },
  logo: { fontFamily: 'Courier', fontSize: 32, fontWeight: 'bold', color: COLORS.text, letterSpacing: 4 },
  logoAccent: { fontFamily: 'Courier', fontSize: 32, fontWeight: 'bold', color: COLORS.inhale, letterSpacing: 4 },
  tagline: { fontFamily: 'Courier', fontSize: 11, color: COLORS.dim, letterSpacing: 1 },

  divider: { height: 1, backgroundColor: COLORS.border },

  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  tabActive: { borderColor: COLORS.inhale, backgroundColor: 'rgba(0,245,255,0.08)' },
  tabText: { fontFamily: 'Courier', fontSize: 11, color: COLORS.dim },
  tabTextActive: { color: COLORS.inhale },

  inputGroup: { gap: 8 },
  label: { fontFamily: 'Courier', fontSize: 10, color: COLORS.dim, letterSpacing: 2 },
  optional: { color: COLORS.dim, fontStyle: 'italic' },
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
  hint: { fontFamily: 'Courier', fontSize: 10, color: COLORS.dim, lineHeight: 16 },

  fileButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  fileButtonText: { fontFamily: 'Courier', fontSize: 13, color: COLORS.text },

  startButton: {
    backgroundColor: COLORS.inhale,
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  startText: { fontFamily: 'Courier', fontSize: 14, fontWeight: 'bold', color: '#000', letterSpacing: 2 },
});
