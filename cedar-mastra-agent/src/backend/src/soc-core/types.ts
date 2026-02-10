import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';

export type SocSupabaseClient = SupabaseClient<Database>;

export type SocDataDeps = {
  supabaseClient?: SocSupabaseClient;
  now?: () => Date;
};
