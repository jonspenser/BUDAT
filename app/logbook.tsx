import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { useTheme } from '../hooks/useTheme';
import { SwellRecord, SwellCategory } from '../hooks/useSwellLog';
import { useSwellLogContext } from '../contexts/SwellLogContext';

type SortKey = 'date' | 'size' | 'direction' | 'speed';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  const hiMs = d.getTime() - 10 * 3600000;
  const hi = new Date(hiMs);
  const mo = hi.getUTCMonth() + 1;
  const day = hi.getUTCDate();
  const hr = hi.getUTCHours();
  const mn = hi.getUTCMinutes();
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = hr % 12 || 12;
  return `${mo}/${day}  ${h12}:${String(mn).padStart(2,'0')} ${ampm}`;
}

async function copyToDocuments(uri: string, ext: string): Promise<string> {
  const filename = `swell_${Date.now()}.${ext}`;
  const dest = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

// ── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ cat, accent }: { cat: SwellCategory; accent: string }) {
  return (
    <View style={[badge.wrap, { borderColor: accent }]}>
      <Text style={[badge.text, { color: accent }]}>{cat}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Courier',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
  },
});

// ── Audio recorder/player ─────────────────────────────────────────────────────

function AudioControls({
  audioUri,
  onRecorded,
  theme,
}: {
  audioUri?: string;
  onRecorded: (uri: string) => void;
  theme: any;
}) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
    } catch {}
  };

  const stopRecording = async () => {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) {
      const dest = await copyToDocuments(uri, 'm4a').catch(() => uri);
      onRecorded(dest);
    }
  };

  const playAudio = async () => {
    if (!audioUri) return;
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlaying(false);
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      soundRef.current = sound;
      setPlaying(true);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          setPlaying(false);
          soundRef.current = null;
        }
      });
    } catch {}
  };

  return (
    <View style={audioStyles.row}>
      {recording ? (
        <TouchableOpacity onPress={stopRecording} style={audioStyles.btn}>
          <Text style={[audioStyles.btnText, { color: theme.accent }]}>■ STOP</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={startRecording} style={audioStyles.btn}>
          <Text style={[audioStyles.btnText, { color: theme.muted }]}>
            {audioUri ? '⊙ RE-RECORD' : '⊙ RECORD'}
          </Text>
        </TouchableOpacity>
      )}
      {audioUri && (
        <TouchableOpacity onPress={playAudio} style={audioStyles.btn}>
          <Text style={[audioStyles.btnText, { color: playing ? theme.accent : theme.muted }]}>
            {playing ? '■ STOP' : '▶ PLAY'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const audioStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { paddingVertical: 4 },
  btnText: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
});

// ── Shared content ────────────────────────────────────────────────────────────

function LogbookContent({ theme, height }: { theme: any; height?: number }) {
  const { records, deleteRecord, updateRecord, clearAll } = useSwellLogContext();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...records];
    switch (sortKey) {
      case 'date':
        return copy.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      case 'size':
        return copy.sort((a, b) => b.heightFt - a.heightFt);
      case 'direction':
        return copy.sort((a, b) => a.directionDeg - b.directionDeg);
      case 'speed':
        return copy.sort((a, b) => b.speedMph - a.speedMph);
    }
  }, [records, sortKey]);

  const pickPhoto = useCallback(async (recId: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() ?? 'jpg';
    const dest = await copyToDocuments(uri, ext).catch(() => uri);
    updateRecord(recId, { photoUri: dest });
  }, [updateRecord]);

  const takePhoto = useCallback(async (recId: string) => {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() ?? 'jpg';
    const dest = await copyToDocuments(uri, ext).catch(() => uri);
    updateRecord(recId, { photoUri: dest });
  }, [updateRecord]);

  const SORT_TABS: { key: SortKey; label: string }[] = [
    { key: 'date',      label: 'DATE' },
    { key: 'size',      label: 'SIZE' },
    { key: 'direction', label: 'DIR' },
    { key: 'speed',     label: 'SPEED' },
  ];

  return (
    <View style={height ? { height, width: Dimensions.get('window').width } : { flex: 1 }}>

      {height != null && (
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderRow}>
            <Text style={[styles.screenTitle, { color: theme.accent }]}>LOG BOOK</Text>
            {records.length > 0 && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    'Clear All Entries',
                    `Delete all ${records.length} log entries? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete All', style: 'destructive', onPress: clearAll },
                    ]
                  )
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.clearBtn, { color: theme.muted }]}>CLEAR ALL</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.titleDivider, { backgroundColor: theme.accent }]} />
        </View>
      )}

      {/* Sort tabs */}
      <View style={[styles.sortRow, { borderBottomColor: theme.accentDim }]}>
        {SORT_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setSortKey(tab.key)}
            style={[styles.sortTab, sortKey === tab.key && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.sortLabel, { color: sortKey === tab.key ? theme.accent : theme.muted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {records.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.muted }]}>No swells logged yet.</Text>
          <Text style={[styles.emptyHint, { color: theme.muted }]}>
            Tap LOG › on any buoy detail screen to save a swell.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {sorted.map(rec => {
            const expanded = expandedId === rec.id;
            return (
              <View key={rec.id}>
                <TouchableOpacity
                  onPress={() => setExpandedId(expanded ? null : rec.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.row}>
                    <CategoryBadge cat={rec.category} accent={theme.accent} />
                    <View style={styles.rowMid}>
                      <Text style={[styles.rowDate, { color: theme.accent }]}>{formatDate(rec.timestamp)}</Text>
                      <Text style={[styles.rowStation, { color: theme.muted }]}>{rec.stationName}</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={[styles.rowHt, { color: theme.textPrimary }]}>{rec.heightFt.toFixed(1)}ft</Text>
                      <Text style={[styles.rowSub, { color: theme.muted }]}>{rec.directionLabel}  {rec.period.toFixed(0)}s</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {expanded && (
                  <View style={[styles.detail, { backgroundColor: theme.accentDim + '22' }]}>
                    {/* Stats grid */}
                    <View style={styles.detailGrid}>
                      <View style={styles.detailCell}>
                        <Text style={[styles.detailLabel, { color: theme.muted }]}>HEIGHT</Text>
                        <Text style={[styles.detailVal, { color: theme.textPrimary }]}>{rec.heightFt.toFixed(1)}ft</Text>
                      </View>
                      <View style={styles.detailCell}>
                        <Text style={[styles.detailLabel, { color: theme.muted }]}>PERIOD</Text>
                        <Text style={[styles.detailVal, { color: theme.textPrimary }]}>{rec.period.toFixed(1)}s</Text>
                      </View>
                      <View style={styles.detailCell}>
                        <Text style={[styles.detailLabel, { color: theme.muted }]}>DIRECTION</Text>
                        <Text style={[styles.detailVal, { color: theme.textPrimary }]}>{rec.directionLabel}  {Math.round(rec.directionDeg)}°</Text>
                      </View>
                      <View style={styles.detailCell}>
                        <Text style={[styles.detailLabel, { color: theme.muted }]}>SPEED</Text>
                        <Text style={[styles.detailVal, { color: theme.textPrimary }]}>{rec.speedMph.toFixed(0)} mph</Text>
                      </View>
                      {rec.windKt != null && (
                        <View style={styles.detailCell}>
                          <Text style={[styles.detailLabel, { color: theme.muted }]}>WIND</Text>
                          <Text style={[styles.detailVal, { color: theme.textPrimary }]}>
                            {rec.windDirLabel ?? '--'}  {Math.round(rec.windKt)}kt
                            {rec.windGustKt != null ? `  G${Math.round(rec.windGustKt)}` : ''}
                          </Text>
                        </View>
                      )}
                      {rec.tideHeightFt != null && (
                        <View style={styles.detailCell}>
                          <Text style={[styles.detailLabel, { color: theme.muted }]}>TIDE</Text>
                          <Text style={[styles.detailVal, { color: theme.textPrimary }]}>
                            {rec.tideHeightFt.toFixed(1)}ft
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Photo */}
                    <Text style={[styles.mediaLabel, { color: theme.muted }]}>PHOTO</Text>
                    {rec.photoUri ? (
                      <Image source={{ uri: rec.photoUri }} style={styles.photo} resizeMode="cover" />
                    ) : null}
                    <View style={styles.photoActions}>
                      <TouchableOpacity onPress={() => takePhoto(rec.id)} style={styles.mediaBtn}>
                        <Text style={[styles.mediaBtnText, { color: theme.muted }]}>
                          {rec.photoUri ? '↺ RETAKE' : '⊙ CAMERA'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => pickPhoto(rec.id)} style={styles.mediaBtn}>
                        <Text style={[styles.mediaBtnText, { color: theme.muted }]}>
                          {rec.photoUri ? '↺ LIBRARY' : '⊕ LIBRARY'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Audio */}
                    <Text style={[styles.mediaLabel, { color: theme.muted }]}>AUDIO NOTE</Text>
                    <AudioControls
                      audioUri={rec.audioUri}
                      onRecorded={uri => updateRecord(rec.id, { audioUri: uri })}
                      theme={theme}
                    />

                    {/* Delete */}
                    <View style={styles.detailActions}>
                      <TouchableOpacity
                        onPress={() => Alert.alert(
                          'Delete Entry',
                          'Remove this swell from the log?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => { deleteRecord(rec.id); setExpandedId(null); },
                            },
                          ]
                        )}
                        style={styles.deleteBtn}
                      >
                        <Text style={[styles.deleteBtnText, { color: theme.muted }]}>DELETE ENTRY</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <View style={[styles.rowDivider, { backgroundColor: theme.accentDim }]} />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ── Full screen (with header + safe area) ─────────────────────────────────────

export default function LogbookScreen() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.accent }]}>← BACK</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.accent }]}>LOG BOOK</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />
      <LogbookContent theme={theme} />
    </SafeAreaView>
  );
}

// ── Embedded page (no screen chrome) ─────────────────────────────────────────

export function LogbookPage({ height, theme }: { height: number; theme: any }) {
  return <LogbookContent theme={theme} height={height} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  backBtn: { width: 70 },
  backText: { fontFamily: 'Courier', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  title: { fontFamily: 'Courier', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  divider: { height: 1, opacity: 0.55 },
  pageHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  clearBtn: {
    fontFamily: 'Courier',
    fontSize: 11,
    letterSpacing: 1,
  },
  screenTitle: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  titleDivider: {
    height: 1,
    opacity: 0.55,
  },
  sortRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
    paddingHorizontal: 14,
  },
  sortTab: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sortLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
  },
  scroll: { paddingHorizontal: 14, paddingBottom: 40 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyText: {
    fontFamily: 'Courier',
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 10,
  },
  emptyHint: {
    fontFamily: 'Courier',
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  rowMid: { flex: 1 },
  rowStation: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1, marginTop: 2 },
  rowDate: { fontFamily: 'Courier', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  rowRight: { alignItems: 'flex-end' },
  rowHt: { fontFamily: 'Courier', fontWeight: '700', fontSize: 16, letterSpacing: 1 },
  rowSub: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  rowDivider: { height: 1, opacity: 0.35 },
  detail: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 4, marginBottom: 4 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  detailCell: { width: '45%' },
  detailLabel: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 1, marginBottom: 2 },
  detailVal: { fontFamily: 'Courier', fontWeight: '600', fontSize: 14, letterSpacing: 0.5 },
  mediaLabel: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 2, marginTop: 14, marginBottom: 6 },
  photo: { width: '100%', height: 180, borderRadius: 4, marginBottom: 6 },
  photoActions: { flexDirection: 'row', gap: 12 },
  mediaBtn: { paddingVertical: 4 },
  mediaBtnText: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  detailActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  deleteBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  deleteBtnText: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1 },
});
