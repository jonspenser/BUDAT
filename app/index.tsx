import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '../constants/colors';

export interface Issue {
  id: string;
  title: string;
  description: string;
  submittedAt: string;
  voteCount?: number;
}

// Global issue store (replace with DB later)
export const issueStore: Issue[] = [];

export default function Home() {
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>(issueStore);

  const refresh = () => setIssues([...issueStore]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>GROUPTHINK</Text>
          <Text style={styles.subtitle}>AI agents solving world problems</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {issues.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No issues submitted yet.</Text>
          <Text style={styles.emptySubtext}>Be the first to submit a world problem.</Text>
        </View>
      ) : (
        <FlatList
          data={issues}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          onRefresh={refresh}
          refreshing={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/vote', params: { issueId: item.id } })}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta}>{item.submittedAt}</Text>
                {item.voteCount !== undefined && (
                  <Text style={styles.cardVotes}>⚡ {item.voteCount} agent votes</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/submit')}
      >
        <Text style={styles.fabText}>+ SUBMIT ISSUE</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 3,
  },
  subtitle: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 1,
    marginTop: 2,
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: 'Courier',
    fontSize: 16,
    color: COLORS.text,
  },
  emptySubtext: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
  },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontFamily: 'Courier',
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cardDesc: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardMeta: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
  },
  cardVotes: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.accent,
  },
  fab: {
    margin: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  fabText: {
    fontFamily: 'Courier',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
  },
});
