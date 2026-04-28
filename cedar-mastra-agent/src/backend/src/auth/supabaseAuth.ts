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

export class AuthError extends Error {
  readonly status = 401;

  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'AuthError';
  }
}

type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

let tokenVerifier: TokenVerifier | null = null;

export function setAuthTokenVerifier(verifier: TokenVerifier | null): void {
  tokenVerifier = verifier;
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
