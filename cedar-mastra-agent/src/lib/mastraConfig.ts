const DEFAULT_LOCAL_MASTRA_BASE_URL = 'http://localhost:4112';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export const MASTRA_BASE_URL = trimTrailingSlashes(
  process.env.NEXT_PUBLIC_MASTRA_URL || DEFAULT_LOCAL_MASTRA_BASE_URL,
);

export const MASTRA_CHAT_ROUTE = '/chat';

export function buildMastraApiUrl(path: `/${string}`): string {
  return `${MASTRA_BASE_URL}${path}`;
}
