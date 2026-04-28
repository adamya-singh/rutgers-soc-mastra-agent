import { BrowserSessionError } from './types.js';

type AdditionalContextEntry = {
  data?: unknown;
};

type AdditionalContext = Record<string, AdditionalContextEntry | AdditionalContextEntry[]>;

function readContextValue(entry: AdditionalContextEntry | AdditionalContextEntry[] | undefined): unknown {
  if (!entry) {
    return undefined;
  }

  const first = Array.isArray(entry) ? entry[0] : entry;
  if (!first) {
    return undefined;
  }

  return first.data ?? first;
}

function resolveBrowserClientIdFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const direct = record.browserClientId;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct;
  }

  const nested = record.browser_client_id;
  if (typeof nested === 'string' && nested.trim().length > 0) {
    return nested;
  }

  return undefined;
}

export function extractBrowserClientIdFromAdditionalContext(additionalContext: unknown): string | null {
  if (!additionalContext || typeof additionalContext !== 'object') {
    return null;
  }

  const context = additionalContext as AdditionalContext;

  const fromPrimaryKey = resolveBrowserClientIdFromUnknown(
    readContextValue(context.browserClientId),
  );
  if (fromPrimaryKey) {
    return fromPrimaryKey;
  }

  const fromAltKey = resolveBrowserClientIdFromUnknown(
    readContextValue(context.browser_client_id),
  );
  if (fromAltKey) {
    return fromAltKey;
  }

  for (const rawEntry of Object.values(context)) {
    const resolved = resolveBrowserClientIdFromUnknown(readContextValue(rawEntry));
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function requireBrowserClientIdFromRuntime(runtimeContext: {
  get: (key: string) => unknown;
}): string {
  const authenticatedUserId = runtimeContext.get('authenticatedUserId');
  if (typeof authenticatedUserId === 'string' && authenticatedUserId.trim().length > 0) {
    return authenticatedUserId;
  }

  const additionalContext = runtimeContext.get('additionalContext');
  const browserClientId = extractBrowserClientIdFromAdditionalContext(additionalContext);

  if (!browserClientId) {
    throw new BrowserSessionError(
      'MISSING_BROWSER_CLIENT_ID',
      'Missing authenticated user context for browser tool usage.',
    );
  }

  return browserClientId;
}
