import { supabaseClient } from '@/lib/supabaseClient';
import {
  applyRemoteSchedules,
  markScheduleSynced,
  type RemoteSchedulePayload,
  type ScheduleEntry,
  type ScheduleSnapshot,
} from '@/lib/scheduleStorage';

type RemoteScheduleRow = {
  id: string;
  user_id: string;
  name: string;
  snapshot: ScheduleSnapshot;
  updated_at: string;
  term_year: number | null;
  term_code: string | null;
  campus: string | null;
};

export const fetchRemoteSchedules = async (): Promise<RemoteSchedulePayload[]> => {
  const { data, error } = await supabaseClient
    .from('schedules')
    .select('id, name, snapshot, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    snapshot: row.snapshot as ScheduleSnapshot,
    updatedAt: row.updated_at,
  }));
};

export const hydrateFromRemote = async () => {
  const remoteSchedules = await fetchRemoteSchedules();
  applyRemoteSchedules(remoteSchedules);
  return remoteSchedules;
};

const buildRemotePayload = (entry: ScheduleEntry, userId: string) => {
  return {
    id: entry.id,
    user_id: userId,
    name: entry.name,
    snapshot: entry.snapshot,
    term_year: entry.snapshot.termYear,
    term_code: entry.snapshot.termCode,
    campus: entry.snapshot.campus,
  } satisfies Omit<RemoteScheduleRow, 'updated_at'>;
};

export const upsertRemoteSchedule = async (
  entry: ScheduleEntry,
  userId: string,
): Promise<string> => {
  const payload = buildRemotePayload(entry, userId);
  const { data, error } = await supabaseClient
    .from('schedules')
    .upsert(payload)
    .select('id, updated_at')
    .single();

  if (error) {
    throw error;
  }

  const updatedAt = data?.updated_at ?? new Date().toISOString();
  markScheduleSynced(entry.id, updatedAt);
  return updatedAt;
};

export const deleteRemoteSchedule = async (scheduleId: string) => {
  const { error } = await supabaseClient.from('schedules').delete().eq('id', scheduleId);
  if (error) {
    throw error;
  }
};

export const updateRemoteScheduleName = async (scheduleId: string, name: string) => {
  const { data, error } = await supabaseClient
    .from('schedules')
    .update({ name })
    .eq('id', scheduleId)
    .select('id, updated_at')
    .single();

  if (error) {
    throw error;
  }

  const updatedAt = data?.updated_at ?? new Date().toISOString();
  markScheduleSynced(scheduleId, updatedAt);
  return updatedAt;
};
