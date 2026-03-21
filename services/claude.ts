import Anthropic from '@anthropic-ai/sdk';
import { AGENT_TYPES } from '../constants/agents';

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

export interface AgentMessage {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  category: string;
  content: string;
}

// Ordered pipeline for deliberation
const PIPELINE = [
  'moderator',
  'researcher',
  'scientist',
  'economist',
  'ethicist',
  'public_health',
  'environmental',
  'geopolitical',
  'critic',
  'fact_checker',
  'synthesizer',
  'moderator',
];

function getInstruction(agentId: string, index: number, isLast: boolean): string {
  if (index === 0) return 'Open this deliberation. Introduce the issue and invite the group to analyze it. 2-3 sentences.';
  if (isLast) return 'Close this deliberation. Give 3 concrete action items the group has converged on. Be specific.';
  switch (agentId) {
    case 'researcher': return 'Provide 3-4 key facts and context the group needs before deliberating.';
    case 'critic': return 'Challenge the most important assumptions in the analyses above. 2-3 pointed critiques.';
    case 'fact_checker': return 'Flag any claims above that need verification or are potentially misleading.';
    case 'synthesizer': return 'Synthesize all perspectives above into a coherent group position. What does the group agree on?';
    default: return 'Contribute your expert analysis. What are the 2-3 most important aspects from your domain?';
  }
}

export async function runDeliberation(
  issue: { id: string; title: string; description: string },
  onMessage: (msg: AgentMessage) => void,
  signal?: AbortSignal,
): Promise<void> {
  const pipeline = PIPELINE.map(id => AGENT_TYPES.find(a => a.id === id)!);
  const transcript: string[] = [];

  for (let i = 0; i < pipeline.length; i++) {
    if (signal?.aborted) return;
    const agent = pipeline[i];
    const isLast = i === pipeline.length - 1;
    const instruction = getInstruction(agent.id, i, isLast);

    const context = transcript.length > 0
      ? `ISSUE: ${issue.title}\n${issue.description}\n\nDELIBERATION SO FAR:\n${transcript.join('\n\n')}\n\n---\n${instruction}`
      : `ISSUE: ${issue.title}\n${issue.description}\n\n---\n${instruction}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: agent.systemPrompt,
      messages: [{ role: 'user', content: context }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    transcript.push(`[${agent.name}]: ${content}`);

    onMessage({
      agentId: agent.id,
      agentName: agent.name,
      agentEmoji: agent.emoji,
      category: agent.category,
      content,
    });
  }
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
