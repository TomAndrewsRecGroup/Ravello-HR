import type { SupabaseClient } from '@supabase/supabase-js';

// The client's calendar (company_calendar_events) shows leave and closed
// days; an interview the recruiter booked belonged there too and never
// was. One row per interview, keyed by source_ref (unique per company,
// 104), so a re-processed event or a reschedule updates the same row
// and a cancellation removes it.

export const interviewSourceRef = (interviewId: string) => `interview:${interviewId}`;

/** Date and HH:MM in the client's zone. Interviews are booked in UK
 *  time; showing the UTC hour would put a 9am summer interview at 8. */
export function londonParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}

export async function syncInterviewCalendar(sb: SupabaseClient, interviewId: string): Promise<'upserted' | 'removed' | 'skipped'> {
  const { data } = await sb.from('interview_schedules')
    .select('id, company_id, candidate_id, requisition_id, scheduled_at, duration_mins, status, stage_label, interview_type')
    .eq('id', interviewId).maybeSingle();
  const iv = data as { id: string; company_id: string; candidate_id: string; requisition_id: string; scheduled_at: string | null; duration_mins: number | null; status: string; stage_label: string | null; interview_type: string | null } | null;
  if (!iv) return 'skipped';
  const ref = interviewSourceRef(iv.id);
  if (iv.status === 'cancelled' || !iv.scheduled_at) {
    const { error } = await sb.from('company_calendar_events').delete().eq('company_id', iv.company_id).eq('source_ref', ref);
    if (error) throw new Error(`calendar delete: ${error.message}`);
    return 'removed';
  }
  const [{ data: cand }, { data: req }] = await Promise.all([
    sb.from('candidates').select('full_name').eq('id', iv.candidate_id).maybeSingle(),
    sb.from('requisitions').select('title').eq('id', iv.requisition_id).maybeSingle(),
  ]);
  const who  = (cand as { full_name?: string } | null)?.full_name ?? 'Candidate';
  const role = (req as { title?: string } | null)?.title ?? 'role';
  const start = londonParts(iv.scheduled_at);
  const end   = londonParts(new Date(Date.parse(iv.scheduled_at) + (iv.duration_mins ?? 60) * 60_000).toISOString());
  const { error } = await sb.from('company_calendar_events').upsert({
    company_id: iv.company_id, source_ref: ref,
    title: `Interview: ${who} · ${role}`.slice(0, 200),
    event_type: 'interview',
    start_date: start.date, end_date: end.date, all_day: false,
    start_time: start.time, end_time: end.time,
    recurring_yearly: false,
    notes: [iv.stage_label, iv.interview_type].filter(Boolean).join(' · ') || null,
  }, { onConflict: 'company_id,source_ref' });
  if (error) throw new Error(`calendar upsert: ${error.message}`);
  return 'upserted';
}
