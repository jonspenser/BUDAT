import Anthropic from '@anthropic-ai/sdk';
import { BreathingPattern } from '../constants/types';

const client = new Anthropic({
  apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '',
  dangerouslyAllowBrowser: true,
});

export async function generateBreathingPattern(
  songTitle: string,
  artist: string,
  bpm?: number,
  energy?: number,   // 0-1 Spotify energy
  valence?: number,  // 0-1 Spotify valence (mood)
): Promise<BreathingPattern> {
  const songInfo = [
    `Song: "${songTitle}" by ${artist}`,
    bpm ? `BPM: ${bpm}` : null,
    energy != null ? `Energy level: ${(energy * 10).toFixed(1)}/10` : null,
    valence != null ? `Mood/positivity: ${(valence * 10).toFixed(1)}/10` : null,
  ].filter(Boolean).join('\n');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are a breathwork coach and music therapist. You design breathing exercises that complement the emotional and rhythmic qualities of songs.
A breathing pattern consists of cycles of inhale / hold / exhale with durations in seconds.
Keep individual phase durations between 2-10 seconds. A typical session is 3-6 minutes.
Match the energy: fast upbeat songs → shorter phases, slow ballads → longer phases.
Low energy / sad songs → longer exhales. High energy → equal inhale/exhale. Hold is optional (0 = skip).`,
    messages: [{
      role: 'user',
      content: `Design a breathing exercise for this song:

${songInfo}

Return JSON only — no markdown, no explanation:
{
  "songTitle": "...",
  "artist": "...",
  "bpm": 120,
  "technique": "box breathing",
  "vibe": "energetic and driving",
  "cycles": [
    {"inhale": 4, "hold": 4, "exhale": 4},
    {"inhale": 4, "hold": 4, "exhale": 4}
  ],
  "totalDuration": 180,
  "notes": "Short coaching tip for the user"
}

Provide 4-8 cycles. Vary them slightly to match the song's structure. totalDuration should reflect the actual sum of all phase durations.`,
    }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse breathing pattern from Claude response.');

  const parsed = JSON.parse(match[0]);
  return parsed as BreathingPattern;
}
