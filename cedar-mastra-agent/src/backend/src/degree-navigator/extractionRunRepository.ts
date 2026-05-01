import { getSupabaseServiceClient } from '../lib/supabase.js';
import type { Json, Tables, TablesInsert } from '../types/database.js';
import {
  DegreeNavigatorExtractionPayload,
  DegreeNavigatorExtractionPayloadSchema,
  DegreeNavigatorExtractionRun,
  DegreeNavigatorExtractionRunSchema,
  DegreeNavigatorExtractionSummary,
  DegreeNavigatorExtractionSummarySchema,
} from './schemas.js';

type DegreeNavigatorExtractionRunDbRow = Tables<'degree_navigator_extraction_runs'>;
type DegreeNavigatorExtractionRunInsert = TablesInsert<'degree_navigator_extraction_runs'>;
type SupabaseServiceClient = ReturnType<typeof getSupabaseServiceClient>;

let getSupabaseServiceClientForRepository = getSupabaseServiceClient;

export function setDegreeNavigatorExtractionRunSupabaseClientFactoryForTest(
  factory: (() => SupabaseServiceClient) | null,
): void {
  getSupabaseServiceClientForRepository = factory ?? getSupabaseServiceClient;
}

function asJson(value: unknown): Json {
  return value as Json;
}

function mapRow(row: DegreeNavigatorExtractionRunDbRow): DegreeNavigatorExtractionRun {
  return DegreeNavigatorExtractionRunSchema.parse({
    id: row.id,
    userId: row.user_id,
    browserSessionId: row.browser_session_id,
    status: row.status,
    payload: row.payload,
    summary: row.summary,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
}

export async function createDegreeNavigatorExtractionRun(input: {
  userId: string;
  browserSessionId: string;
  payload: DegreeNavigatorExtractionPayload;
  summary: DegreeNavigatorExtractionSummary;
  expiresAt?: string;
}): Promise<DegreeNavigatorExtractionRun> {
  const payload = DegreeNavigatorExtractionPayloadSchema.parse(input.payload);
  const summary = DegreeNavigatorExtractionSummarySchema.parse(input.summary);
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const row: DegreeNavigatorExtractionRunInsert = {
    user_id: input.userId,
    browser_session_id: input.browserSessionId,
    status: 'created',
    payload: asJson(payload),
    summary: asJson(summary),
    expires_at: expiresAt,
  };

  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('degree_navigator_extraction_runs')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create Degree Navigator extraction run: ${error.message}`);
  }

  return mapRow(data);
}

export async function getDegreeNavigatorExtractionRun(
  userId: string,
  runId: string,
): Promise<DegreeNavigatorExtractionRun | null> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('degree_navigator_extraction_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read Degree Navigator extraction run: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const run = mapRow(data);
  if (new Date(run.expiresAt).getTime() < Date.now()) {
    return {
      ...run,
      status: 'expired',
    };
  }

  return run;
}
