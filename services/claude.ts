import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '',
  dangerouslyAllowBrowser: true,
});

export interface VoteResult {
  agentId: string;
  issueId: string;
  score: number; // 1-10
  reasoning: string;
}

export async function agentVote(
  agentSystemPrompt: string,
  agentName: string,
  issues: { id: string; title: string; description: string }[]
): Promise<VoteResult[]> {
  const issueList = issues
    .map((i, idx) => `${idx + 1}. [${i.id}] ${i.title}: ${i.description}`)
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: agentSystemPrompt,
    messages: [
      {
        role: 'user',
        content: `You are participating in a priority vote for world issues that AI agent groups will tackle.

Score each issue from 1-10 based on urgency, global impact, and relevance to your expertise.

Issues:
${issueList}

Respond in JSON only, as an array:
[{"issueId": "id", "score": 8, "reasoning": "brief reason"}]`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.map((v: any) => ({
    agentId: agentName,
    issueId: v.issueId,
    score: v.score,
    reasoning: v.reasoning,
  }));
}
