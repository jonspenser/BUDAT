import React, { useEffect, useState, useRef } from 'react';
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
import { AGENT_TYPES } from '../constants/agents';
import { agentVote, VoteResult } from '../services/claude';
import { issueStore } from './index';

interface AgentStatus {
  agentId: string;
  name: string;
  emoji: string;
  category: string;
  status: 'waiting' | 'voting' | 'done' | 'error';
  score?: number;
  reasoning?: string;
}

export default function Vote() {
  const { issueId } = useLocalSearchParams<{ issueId: string }>();
  const router = useRouter();
  const issue = issueStore.find(i => i.id === issueId);

  const [agents, setAgents] = useState<AgentStatus[]>(
    AGENT_TYPES.map(a => ({
      agentId: a.id,
      name: a.name,
      emoji: a.emoji,
      category: a.category,
      status: 'waiting',
    }))
  );
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [phase, setPhase] = useState<'voting' | 'done'>('voting');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!issue) return;
    runVoting();
  }, []);

  async function runVoting() {
    if (!issue) return;

    const batchSize = 3;
    const results: VoteResult[] = [];

    for (let i = 0; i < AGENT_TYPES.length; i += batchSize) {
      const batch = AGENT_TYPES.slice(i, i + batchSize);

      // Mark batch as voting
      setAgents(prev =>
        prev.map(a =>
          batch.find(b => b.id === a.agentId) ? { ...a, status: 'voting' } : a
        )
      );

      // Run batch in parallel
      await Promise.all(
        batch.map(async agent => {
          try {
            const votes = await agentVote(agent.systemPrompt, agent.id, [issue]);
            const vote = votes.find(v => v.issueId === issue.id);
            results.push({ agentId: agent.id, issueId: issue.id, score: vote?.score ?? 5, reasoning: vote?.reasoning ?? '' });
            setAgents(prev =>
              prev.map(a =>
                a.agentId === agent.id
                  ? { ...a, status: 'done', score: vote?.score, reasoning: vote?.reasoning }
                  : a
              )
            );
          } catch {
            setAgents(prev =>
              prev.map(a => (a.agentId === agent.id ? { ...a, status: 'error' } : a))
            );
          }
        })
      );
    }

    // Calculate final score
    const scores = results.map(r => r.score);
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    setFinalScore(Math.round(avg * 10) / 10);
    setPhase('done');

    // Update issue store
    const idx = issueStore.findIndex(i => i.id === issue.id);
    if (idx !== -1) issueStore[idx].voteCount = results.length;
  }

  const categoryColor: Record<string, string> = {
    domain: COLORS.domain,
    process: COLORS.process,
    output: COLORS.output,
    governance: COLORS.governance,
  };

  const doneCount = agents.filter(a => a.status === 'done').length;
  const progress = doneCount / agents.length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Issue */}
        <View style={styles.issueCard}>
          <Text style={styles.issueLabel}>ISSUE UNDER VOTE</Text>
          <Text style={styles.issueTitle}>{issue?.title ?? 'Unknown issue'}</Text>
          <Text style={styles.issueDesc}>{issue?.description}</Text>
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>
            {phase === 'done' ? 'VOTING COMPLETE' : `${doneCount} / ${agents.length} AGENTS VOTED`}
          </Text>
          {phase === 'voting' && (
            <Animated.Text style={[styles.pulse, { transform: [{ scale: pulseAnim }] }]}>⚡</Animated.Text>
          )}
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        {/* Final score */}
        {finalScore !== null && (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>PRIORITY SCORE</Text>
            <Text style={styles.scoreValue}>{finalScore}<Text style={styles.scoreMax}>/10</Text></Text>
            <Text style={styles.scoreSubtext}>
              {finalScore >= 8 ? 'CRITICAL — Agent groups will be formed immediately' :
               finalScore >= 6 ? 'HIGH — Queued for agent group formation' :
               finalScore >= 4 ? 'MODERATE — Added to issue pool' :
               'LOW — Archived for future review'}
            </Text>
          </View>
        )}

        {/* Agent list */}
        <Text style={styles.sectionLabel}>AGENT VOTES</Text>
        {agents.map(agent => (
          <View key={agent.agentId} style={styles.agentRow}>
            <View style={styles.agentLeft}>
              <Text style={styles.agentEmoji}>{agent.emoji}</Text>
              <View>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={[styles.agentCategory, { color: categoryColor[agent.category] }]}>
                  {agent.category.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.agentRight}>
              {agent.status === 'waiting' && <Text style={styles.statusWaiting}>—</Text>}
              {agent.status === 'voting' && (
                <Animated.Text style={[styles.statusVoting, { transform: [{ scale: pulseAnim }] }]}>
                  VOTING...
                </Animated.Text>
              )}
              {agent.status === 'done' && (
                <Text style={styles.statusDone}>{agent.score}/10</Text>
              )}
              {agent.status === 'error' && <Text style={styles.statusError}>ERR</Text>}
            </View>
          </View>
        ))}

        {/* Reasoning */}
        {phase === 'done' && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>AGENT REASONING</Text>
            {agents.filter(a => a.reasoning).map(agent => (
              <View key={agent.agentId} style={styles.reasonCard}>
                <Text style={styles.reasonAgent}>{agent.emoji} {agent.name}</Text>
                <Text style={styles.reasonText}>{agent.reasoning}</Text>
              </View>
            ))}
          </>
        )}

        {/* Deliberation CTA */}
        {phase === 'done' && (
          <TouchableOpacity
            style={styles.deliberateBtn}
            onPress={() => router.push({ pathname: '/deliberate', params: { issueId: issue?.id } })}
          >
            <Text style={styles.deliberateBtnText}>START DELIBERATION →</Text>
            <Text style={styles.deliberateBtnSub}>12 agents tackle this issue together</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, gap: 12 },
  issueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
  },
  issueLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  issueTitle: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  issueDesc: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    lineHeight: 18,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.accent,
    letterSpacing: 1,
  },
  pulse: { fontSize: 16 },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  scoreCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  scoreLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  scoreValue: {
    fontFamily: 'Courier',
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  scoreMax: {
    fontSize: 20,
    color: COLORS.dim,
  },
  scoreSubtext: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  sectionLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  agentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  agentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agentEmoji: { fontSize: 20 },
  agentName: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.text,
  },
  agentCategory: {
    fontFamily: 'Courier',
    fontSize: 9,
    letterSpacing: 1,
  },
  agentRight: { minWidth: 60, alignItems: 'flex-end' },
  statusWaiting: { fontFamily: 'Courier', fontSize: 14, color: COLORS.dim },
  statusVoting: { fontFamily: 'Courier', fontSize: 10, color: COLORS.accent, letterSpacing: 1 },
  statusDone: { fontFamily: 'Courier', fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  statusError: { fontFamily: 'Courier', fontSize: 10, color: COLORS.domain },
  reasonCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 6,
  },
  reasonAgent: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  reasonText: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    lineHeight: 16,
  },
  deliberateBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    marginTop: 24,
    gap: 4,
  },
  deliberateBtnText: {
    fontFamily: 'Courier',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
  },
  deliberateBtnSub: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
});
