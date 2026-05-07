import { generateObject } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';

import type { ChatMessage } from '../chat/schemas.js';
import { getMessageTextContent } from '../chat/repository.js';

const MAX_TURNS = 6;
const MAX_TURN_CHARS = 3000;
const SUGGESTION_MIN_LENGTH = 3;
const SUGGESTION_MAX_LENGTH = 120;

const SuggestionsSchema = z.object({
  suggestions: z
    .array(z.string().min(SUGGESTION_MIN_LENGTH).max(SUGGESTION_MAX_LENGTH))
    .length(2),
});

const SUGGESTION_SYSTEM_PROMPT = `You generate exactly two short, distinct follow-up prompts that a real Rutgers undergrad would casually type next while chatting with an assistant about the Schedule of Classes.

Voice and tone:
- Write the way a student actually talks to a chatbot — casual, plain English, conversational. Think text-message energy, not formal academic English.
- It's totally fine (and preferred) to be a little informal: contractions ("what's", "I'm", "can I"), lowercase starts, sentence fragments, friendly phrasing.
- Use everyday course nicknames instead of formal Rutgers course codes whenever a common name exists. Examples:
  - "Calc 1" instead of "01:640:151"
  - "CS 111" or "Intro to CS" instead of "01:198:111"
  - "Data Structures" instead of "01:198:112"
  - "Expos" instead of "01:355:101"
  - "Physics 1" instead of "01:750:203"
- Only fall back to a full course code or 5-digit index number when there is genuinely no friendlier name and the assistant just specifically used that exact code/index.
- Refer to people, buildings, and times naturally ("Tillett", "morning sections", "Mondays") rather than as identifiers.

Rules:
- Output EXACTLY 2 suggestions. Each must be a full prompt the student could send as their very next message.
- Write each suggestion in first person, as if the student is typing it (e.g. "what are some easy electives I could take next semester?", "is data structures still open?", "any morning sections of calc 1?", "add this to my schedule").
- Each suggestion MUST be at most ${SUGGESTION_MAX_LENGTH} characters and ideally under 80. Shorter is better.
- The two suggestions must clearly differ from each other (different action or different topic).
- Anchor the suggestions to whatever the assistant just talked about, but phrase that reference in plain English (e.g. "is that class hard?", "what days does it meet?", "what should I take after it?").
- Suggest natural next actions a student would actually want: checking if something's open, finding a different time, comparing professors, asking about prereqs, fitting it into their schedule, picking an alternative, or asking for a recommendation.
- Do NOT echo or paraphrase what the user just said.
- Do NOT propose meta prompts like "tell me more" or "explain that again". Each suggestion must be substantive and actionable.
- Do NOT include quotation marks, leading bullets, numbering, or emoji. End with a question mark or no punctuation.
- Do NOT mention that you are an AI or refer to "the assistant" — write only the student's next prompt text.`;

let cachedVertex: ReturnType<typeof createVertex> | null = null;

function getVertex(): ReturnType<typeof createVertex> {
  if (cachedVertex) return cachedVertex;
  cachedVertex = createVertex({
    project: process.env.GOOGLE_VERTEX_PROJECT || 'concise-foundry-465822-d7',
    location: process.env.GOOGLE_VERTEX_LOCATION || 'global',
    googleAuthOptions: {
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
  });
  return cachedVertex;
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function buildConversationTranscript(messages: ChatMessage[]): {
  transcript: string;
  hasUser: boolean;
  hasAssistant: boolean;
} {
  const eligible = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  );
  const recent = eligible.slice(-MAX_TURNS);

  const lines: string[] = [];
  let hasUser = false;
  let hasAssistant = false;

  for (const message of recent) {
    const text = getMessageTextContent(message.uiMessage);
    if (!text) continue;
    if (message.role === 'user') hasUser = true;
    if (message.role === 'assistant') hasAssistant = true;
    const speaker = message.role === 'user' ? 'Student' : 'Assistant';
    lines.push(`${speaker}: ${truncateText(text, MAX_TURN_CHARS)}`);
  }

  return {
    transcript: lines.join('\n\n'),
    hasUser,
    hasAssistant,
  };
}

export async function generateChatSuggestions(
  messages: ChatMessage[],
): Promise<string[]> {
  const { transcript, hasUser, hasAssistant } = buildConversationTranscript(messages);
  if (!hasUser || !hasAssistant || !transcript) {
    return [];
  }

  try {
    const vertex = getVertex();
    const result = await generateObject({
      model: vertex('gemini-3-flash-preview'),
      schema: SuggestionsSchema,
      system: SUGGESTION_SYSTEM_PROMPT,
      prompt: `Conversation so far:\n\n${transcript}\n\nProduce two follow-up prompts the student is most likely to want to send next, anchored to the latest Assistant reply. Write them the way a real undergrad would casually type them — plain English, friendly, lowercase is fine. Use course nicknames like "Calc 1", "CS 111", "Data Structures", "Expos" instead of codes like "01:640:151" whenever possible.`,
      temperature: 0.7,
    });

    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const raw of result.object.suggestions) {
      const cleaned = raw.replace(/^[-*\d.\s"]+/, '').replace(/["'\s]+$/, '').trim();
      if (cleaned.length < SUGGESTION_MIN_LENGTH) continue;
      const dedupeKey = cleaned.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      suggestions.push(cleaned.slice(0, SUGGESTION_MAX_LENGTH));
    }

    return suggestions.slice(0, 2);
  } catch (error) {
    console.warn('[chat-suggestions] generateObject failed', error);
    return [];
  }
}
