import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS } from '../constants/colors';
import { AgentMessage, runDeliberation } from '../services/claude';
import { issueStore } from './index';

const CATEGORY_COLOR: Record<string, string> = {
  domain: COLORS.domain,
  process: COLORS.process,
  output: COLORS.output,
  governance: COLORS.governance,
};

export default function Deliberate() {
  const { issueId } = useLocalSearchParams<{ issueId: string }>();
  const router = useRouter();
  const issue = issueStore.find(i => i.id === issueId);

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [phase, setPhase] = useState<'running' | 'done'>('running');
  const [thinkingAgent, setThinkingAgent] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const dotAnim = useRef(new Animated.Value(0)).current;
  const abortRef = useRef<AbortController>(new AbortController());

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!issue) return;
    startDeliberation();
    return () => abortRef.current.abort();
  }, []);

  async function startDeliberation() {
    if (!issue) return;
    setThinking(true);

    const PIPELINE_NAMES = [
      'Moderator', 'Researcher', 'Scientist', 'Economist', 'Ethicist',
      'Public Health Expert', 'Environmental Specialist', 'Geopolitical Analyst',
      'Critic', 'Fact Checker', 'Synthesizer', 'Moderator',
    ];
    let step = 0;

    try {
      await runDeliberation(
        issue,
        (msg) => {
          setThinkingAgent(PIPELINE_NAMES[step + 1] ?? '');
          step++;
          setMessages(prev => [...prev, msg]);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        },
        abortRef.current.signal,
      );
    } finally {
      setThinking(false);
      setPhase('done');
    }
  }

  const dotOpacity = dotAnim;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>DELIBERATION</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>{issue?.title ?? 'Unknown issue'}</Text>
        <View style={styles.phaseBadge}>
          <Text style={[styles.phaseBadgeText, phase === 'done' && styles.phaseDone]}>
            {phase === 'done' ? '✓ CONSENSUS REACHED' : '⚡ IN PROGRESS'}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Chat feed */}
      <ScrollView
        ref={scrollRef}
        style={styles.feed}
        contentContainerStyle={styles.feedContent}
      >
        {messages.map((msg, idx) => (
          <View key={idx} style={styles.messageCard}>
            <View style={styles.messageHeader}>
              <Text style={styles.msgEmoji}>{msg.agentEmoji}</Text>
              <View style={styles.msgMeta}>
                <Text style={styles.msgName}>{msg.agentName}</Text>
                <Text style={[styles.msgCategory, { color: CATEGORY_COLOR[msg.category] }]}>
                  {msg.category.toUpperCase()}
                </Text>
              </View>
              {msg.agentId === 'synthesizer' && (
                <View style={styles.consensusBadge}>
                  <Text style={styles.consensusBadgeText}>SYNTHESIS</Text>
                </View>
              )}
            </View>
            <Text style={styles.msgContent}>{msg.content}</Text>
          </View>
        ))}

        {/* Thinking indicator */}
        {thinking && (
          <View style={styles.thinkingRow}>
            <Animated.Text style={[styles.thinkingDot, { opacity: dotOpacity }]}>●</Animated.Text>
            <Animated.Text style={[styles.thinkingDot, { opacity: dotOpacity }]}>●</Animated.Text>
            <Animated.Text style={[styles.thinkingDot, { opacity: dotOpacity }]}>●</Animated.Text>
            {thinkingAgent ? (
              <Text style={styles.thinkingLabel}> {thinkingAgent} thinking...</Text>
            ) : null}
          </View>
        )}

        {/* Consensus highlight */}
        {phase === 'done' && messages.find(m => m.agentId === 'synthesizer') && (
          <View style={styles.consensusCard}>
            <Text style={styles.consensusLabel}>🔗 GROUP CONSENSUS</Text>
            <Text style={styles.consensusText}>
              {messages.find(m => m.agentId === 'synthesizer')?.content}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Done actions */}
      {phase === 'done' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
            <Text style={styles.btnSecondaryText}>← BACK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => {
              setMessages([]);
              setPhase('running');
              setThinking(true);
              abortRef.current = new AbortController();
              startDeliberation();
            }}
          >
            <Text style={styles.btnPrimaryText}>↺ RE-DELIBERATE</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 4,
  },
  headerLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 3,
  },
  headerTitle: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  phaseBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  phaseBadgeText: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.accent,
    letterSpacing: 1,
  },
  phaseDone: {
    color: COLORS.output,
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  feed: { flex: 1 },
  feedContent: { padding: 14, gap: 12, paddingBottom: 24 },
  messageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  msgEmoji: { fontSize: 22 },
  msgMeta: { flex: 1 },
  msgName: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  msgCategory: {
    fontFamily: 'Courier',
    fontSize: 9,
    letterSpacing: 1,
  },
  consensusBadge: {
    backgroundColor: COLORS.primary + '33',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  consensusBadgeText: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: COLORS.primary,
    letterSpacing: 1,
  },
  msgContent: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    lineHeight: 18,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  thinkingDot: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.accent,
  },
  thinkingLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 1,
    marginLeft: 4,
  },
  consensusCard: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  consensusLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  consensusText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
  },
});
