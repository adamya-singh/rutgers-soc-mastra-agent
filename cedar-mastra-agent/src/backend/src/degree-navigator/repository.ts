import { getSupabaseServiceClient } from '../lib/supabase.js';
import type { Json, Tables, TablesInsert } from '../types/database.js';
import {
  DegreeNavigatorCapture,
  DegreeNavigatorCaptureSchema,
  DegreeNavigatorProfileRow,
  DegreeNavigatorProfileRowSchema,
} from './schemas.js';

type DegreeNavigatorProfileDbRow = Tables<'degree_navigator_profiles'>;
type DegreeNavigatorProfileInsert = TablesInsert<'degree_navigator_profiles'>;

function asJson(value: unknown): Json {
  return value as Json;
}

function mapRow(row: DegreeNavigatorProfileDbRow): DegreeNavigatorProfileRow {
  return DegreeNavigatorProfileRowSchema.parse({
    id: row.id,
    userId: row.user_id,
    schemaVersion: row.schema_version,
    studentName: row.student_name,
    ruid: row.ruid,
    netid: row.netid,
    schoolCode: row.school_code,
    schoolName: row.school_name,
    graduationYear: row.graduation_year,
    graduationMonth: row.graduation_month,
    degreeCreditsEarned: row.degree_credits_earned,
    cumulativeGpa: row.cumulative_gpa,
    plannedCourseCount: row.planned_course_count,
    profile: row.profile,
    programs: row.programs,
    audits: row.audits,
    transcriptTerms: row.transcript_terms,
    runNotes: row.run_notes,
    source: row.source,
    sourceSessionId: row.source_session_id,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function buildPayload(
  userId: string,
  input: DegreeNavigatorCapture,
): DegreeNavigatorProfileInsert {
  const capture = DegreeNavigatorCaptureSchema.parse(input);
  const { profile } = capture;

  return {
    user_id: userId,
    schema_version: capture.schemaVersion,
    student_name: profile.name ?? null,
    ruid: profile.ruid ?? null,
    netid: profile.netid ?? null,
    school_code: profile.school?.code ?? null,
    school_name: profile.school?.name ?? null,
    graduation_year: profile.declaredGraduation?.year ?? null,
    graduation_month: profile.declaredGraduation?.month ?? null,
    degree_credits_earned: profile.degreeCreditsEarned ?? null,
    cumulative_gpa: profile.cumulativeGpa ?? null,
    planned_course_count: profile.plannedCourseCount ?? null,
    profile: asJson(capture.profile),
    programs: asJson(capture.programs),
    audits: asJson(capture.audits),
    transcript_terms: asJson(capture.transcriptTerms),
    run_notes: asJson(capture.runNotes),
    source: capture.source,
    source_session_id: capture.sourceSessionId ?? null,
    captured_at: capture.capturedAt ?? new Date().toISOString(),
  };
}

export async function upsertDegreeNavigatorProfile(
  userId: string,
  input: DegreeNavigatorCapture,
): Promise<DegreeNavigatorProfileRow> {
  const supabase = getSupabaseServiceClient();
  const payload = buildPayload(userId, input);
  const { data, error } = await supabase
    .from('degree_navigator_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to save Degree Navigator profile: ${error.message}`);
  }

  return mapRow(data);
}

export async function getDegreeNavigatorProfile(
  userId: string,
): Promise<DegreeNavigatorProfileRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('degree_navigator_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read Degree Navigator profile: ${error.message}`);
  }

  return data ? mapRow(data) : null;
}
