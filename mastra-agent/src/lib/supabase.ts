import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';

/**
 * Lazily initialized Supabase client.
 * Environment variables are only checked when the client is first used.
 */
let _supabase: SupabaseClient<Database> | null = null;

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
 * Supabase client instance.
 * @deprecated Use getSupabaseClient() for better error handling
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return Reflect.get(getSupabaseClient(), prop);
  },
});
