import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';

/**
 * Lazily initialized Supabase client.
 * Environment variables are only checked when the client is first used.
 */
let _supabase: SupabaseClient<Database> | null = null;
let _supabaseService: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (_supabase) {
    return _supabase;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  _supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'rutgers-soc-agent',
        },
      },
    }
  );

  return _supabase;
}

/**
 * Service-role Supabase client for backend-only operations.
 *
 * Use this for private tables that browser anon/authenticated roles must not
 * access directly. Never expose the service role key to the frontend.
 */
export function getSupabaseServiceClient(): SupabaseClient<Database> {
  if (_supabaseService) {
    return _supabaseService;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!process.env.SUPABASE_URL || !serviceKey) {
    throw new Error(
      'Missing Supabase service environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
  }

  _supabaseService = createClient<Database>(
    process.env.SUPABASE_URL,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'rutgers-soc-agent-service',
        },
      },
    },
  );

  return _supabaseService;
}

/**
 * Supabase client instance.
 * @deprecated Use getSupabaseClient() for better error handling
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return Reflect.get(getSupabaseClient(), prop);
  },
});
