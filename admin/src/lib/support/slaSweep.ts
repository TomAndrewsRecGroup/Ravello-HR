import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';

// Every consumer run: any open request whose SLA has passed with no
// first response gets ONE reminder event per day (dedupe
// `sla:<id>:<day>`), which the sr_sla_breached rule turns into an urgent
// nudge to the account owner. The reminders cron runs at 06:00 only; a
// 4-hour SLA on an urgent request needs something that looks more often.

export interface SlaSweepTally { open_breached: number; emitted: number; error: string | null }

export async function sweepSlaBreaches(sb: SupabaseClient, now: Date = new Date()): Promise<SlaSweepTally> {
  const nowIso = now.toISOString();
  const day = nowIso.slice(0, 10);
  const read = await readAllPages<{ id: string; company_id: string; subject: string; request_type: string; urgency: string | null; status: string; sla_due_at: string; created_at: string }>((from, to) =>
    sb.from('service_requests').select('id, company_id, subject, request_type, urgency, status, sla_due_at, created_at')
      .in('status', ['new', 'in_progress']).is('first_response_at', null).lt('sla_due_at', nowIso).order('id').range(from, to));
  if (read.error) return { open_breached: 0, emitted: 0, error: read.error };

  let emitted = 0;
  for (const r of read.rows) {
    const { data, error } = await sb.from('platform_events').upsert({
      company_id: r.company_id, entity_type: 'service_requests', entity_id: r.id, event_type: 'reminder',
      payload: { bucket: 'sla_breached', due_date: r.sla_due_at, row: { id: r.id, subject: r.subject, request_type: r.request_type, urgency: r.urgency, status: r.status, sla_due_at: r.sla_due_at, created_at: r.created_at } },
      actor_kind: 'system', dedupe_key: `sla:${r.id}:${day}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    if (error) return { open_breached: read.rows.length, emitted, error: error.message };
    if ((data ?? []).length > 0) emitted++;
  }
  return { open_breached: read.rows.length, emitted, error: null };
}
