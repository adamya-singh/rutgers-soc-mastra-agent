import { buildMastraApiUrl } from '@/lib/mastraConfig';
import { supabaseClient } from '@/lib/supabaseClient';

interface ChatSuggestionsResponse {
  suggestions: string[];
}

export interface FetchChatSuggestionsOptions {
  signal?: AbortSignal;
}

export async function fetchChatSuggestions(
  threadId: string,
  options: FetchChatSuggestionsOptions = {},
): Promise<string[]> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return [];
  }

  const response = await fetch(buildMastraApiUrl('/chat/suggestions'), {
    method: 'POST',
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ threadId }),
  });

  if (!response.ok) {
    return [];
  }

  const text = await response.text();
  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text) as Partial<ChatSuggestionsResponse>;
    if (!Array.isArray(parsed.suggestions)) {
      return [];
    }
    return parsed.suggestions
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());
  } catch {
    return [];
  }
}
