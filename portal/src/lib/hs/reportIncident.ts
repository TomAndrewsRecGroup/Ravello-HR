import type { SupabaseClient } from '@supabase/supabase-js';

// Saving an incident report exactly once (spec QA 31).
//
// A report on a site phone can lose its connection AFTER the database
// has committed the row but before the reply arrives. The form then
// shows "not saved, try again", and a plain retry files the same event
// twice under two incident numbers. So the form fixes the report's id
// when it opens and sends it with every attempt: the first attempt that
// reaches the database creates the row, and any later attempt meets the
// primary key (23505), reads the row it already made and carries on.
//
// A 23505 that is NOT our row (the incident-number index, in theory) is
// still an error: we only claim success for a row we can read back by
// the id we sent. The reporter can always read their own report (125).

export interface SavedIncident { id: string; incident_number: string }

export async function insertIncidentOnce(
  sb: SupabaseClient,
  id: string,
  row: Record<string, unknown>,
): Promise<{ data: SavedIncident | null; error: string | null; recovered: boolean }> {
  const { data, error } = await sb.from('hs_incidents').insert({ ...row, id }).select('id, incident_number').single();
  if (!error && data) return { data: data as SavedIncident, error: null, recovered: false };
  if (error?.code === '23505') {
    const { data: existing } = await sb.from('hs_incidents').select('id, incident_number').eq('id', id).maybeSingle();
    if (existing) return { data: existing as SavedIncident, error: null, recovered: true };
  }
  return { data: null, error: error?.message ?? 'The report was not saved. Please try again.', recovered: false };
}
