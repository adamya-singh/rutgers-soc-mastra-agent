import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { getSupabaseClient } from '../lib/supabase.js';

export type AuthenticatedUser = {
  userId: string;
  email?: string;
};

type RequestLike = {
  req?: {
    header?: (name: string) => string | undefined;
    raw?: {
      headers?: Headers;
    };
  };
};

export const ANONYMOUS_CHAT_TOKEN_HEADER = 'X-Anonymous-Chat-Token';
export const ANONYMOUS_CHAT_AUTH_SCHEME = 'Anonymous';
const ANONYMOUS_CHAT_TOKEN_PREFIX = 'anon';
const ANONYMOUS_CHAT_TOKEN_VERSION = 'v1';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AuthError extends Error {
  readonly status = 401;

  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'AuthError';
  }
}

type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

let tokenVerifier: TokenVerifier | null = null;
let anonymousTokenSecretOverride: string | null = null;

export function setAuthTokenVerifier(verifier: TokenVerifier | null): void {
  tokenVerifier = verifier;
}

export function setAnonymousChatTokenSecretForTest(secret: string | null): void {
  anonymousTokenSecretOverride = secret;
}

function readAuthorizationHeader(context: RequestLike): string | undefined {
  const fromHeaderFn =
    context.req?.header?.('Authorization') ??
    context.req?.header?.('authorization');
  if (fromHeaderFn) {
    return fromHeaderFn;
  }

  return context.req?.raw?.headers?.get('Authorization') ?? undefined;
}

function readAnonymousChatTokenHeader(context: RequestLike): string | undefined {
  const authorization = readAuthorizationHeader(context);
  const authorizationMatch = authorization?.match(/^Anonymous\s+(.+)$/i);
  const authorizationToken = authorizationMatch?.[1]?.trim();
  if (authorizationToken) {
    return authorizationToken;
  }

  const fromHeaderFn =
    context.req?.header?.(ANONYMOUS_CHAT_TOKEN_HEADER) ??
    context.req?.header?.(ANONYMOUS_CHAT_TOKEN_HEADER.toLowerCase());
  if (fromHeaderFn) {
    return fromHeaderFn;
  }

  return context.req?.raw?.headers?.get(ANONYMOUS_CHAT_TOKEN_HEADER) ?? undefined;
}

export function extractBearerToken(context: RequestLike): string {
  const authorization = readAuthorizationHeader(context);
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new AuthError('Missing bearer token.');
  }

  return token;
}

export async function verifySupabaseAccessToken(token: string): Promise<AuthenticatedUser> {
  if (tokenVerifier) {
    return tokenVerifier(token);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new AuthError('Invalid bearer token.');
  }

  return {
    userId: data.user.id,
    email: data.user.email,
  };
}

export async function requireAuthenticatedUser(context: RequestLike): Promise<AuthenticatedUser> {
  return verifySupabaseAccessToken(extractBearerToken(context));
}

function getAnonymousChatTokenSecret(): string {
  const secret =
    anonymousTokenSecretOverride ??
    process.env.ANONYMOUS_CHAT_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!secret) {
    throw new Error('Missing anonymous chat token secret.');
  }

  return secret;
}

function signAnonymousClientId(clientId: string): string {
  return createHmac('sha256', getAnonymousChatTokenSecret())
    .update(`${ANONYMOUS_CHAT_TOKEN_VERSION}.${clientId}`)
    .digest('base64url');
}

export function createAnonymousChatToken(clientId = randomUUID()): {
  anonymousClientId: string;
  token: string;
} {
  if (!UUID_REGEX.test(clientId)) {
    throw new Error('Anonymous chat client id must be a UUID.');
  }

  const signature = signAnonymousClientId(clientId);
  return {
    anonymousClientId: clientId,
    token: [
      ANONYMOUS_CHAT_TOKEN_PREFIX,
      ANONYMOUS_CHAT_TOKEN_VERSION,
      clientId,
      signature,
    ].join('.'),
  };
}

export function verifyAnonymousChatToken(token: string): string {
  const [prefix, version, clientId, signature, extra] = token.split('.');
  if (
    extra !== undefined ||
    prefix !== ANONYMOUS_CHAT_TOKEN_PREFIX ||
    version !== ANONYMOUS_CHAT_TOKEN_VERSION ||
    !clientId ||
    !signature ||
    !UUID_REGEX.test(clientId)
  ) {
    throw new AuthError('Invalid anonymous chat token.');
  }

  const expected = signAnonymousClientId(clientId);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new AuthError('Invalid anonymous chat token.');
  }

  return clientId;
}

export type ChatPrincipal =
  | ({ type: 'authenticated' } & AuthenticatedUser)
  | {
      type: 'anonymous';
      anonymousClientId: string;
    };

export async function resolveChatPrincipal(context: RequestLike): Promise<ChatPrincipal> {
  const authorization = readAuthorizationHeader(context);
  if (authorization?.match(/^Bearer\s+/i)) {
    const authenticatedUser = await verifySupabaseAccessToken(extractBearerToken(context));
    return {
      type: 'authenticated',
      ...authenticatedUser,
    };
  }

  const anonymousToken = readAnonymousChatTokenHeader(context)?.trim();
  if (anonymousToken) {
    return {
      type: 'anonymous',
      anonymousClientId: verifyAnonymousChatToken(anonymousToken),
    };
  }

  throw new AuthError('Missing chat authentication.');
}

export async function requireAuthenticatedUserWithFallbackToken(
  context: RequestLike,
  fallbackToken?: string,
): Promise<AuthenticatedUser> {
  try {
    return await requireAuthenticatedUser(context);
  } catch (error) {
    if (fallbackToken && error instanceof AuthError) {
      return verifySupabaseAccessToken(fallbackToken);
    }

    throw error;
  }
}
