import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { REMINDERS, STATUS_WRITES, bucketFor, wanted, type ReminderRule, type StatusWrite } from './rules';

// The morning reminders run. See rules.ts for what it walks.

export interface RemindersTally {
  rules:         number;
  rows_read:     number;
  events_new:    number;
  status_writes: Record<string, number>;
  truncated:     string[];
  errors:        string[];
}

const CHUNK = 200;

/** Only the rule's own selected columns travel in the payload — never
 *  an embed and never a column PostgREST happened to return. */
export function slimRow(row: Record<string, unknown>, select: string): Record<string, unknown> {
  const keep = select.split(',').map(s => s.trim()).filter(s => s && !s.includes(':') && !s.includes('('));
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in row) out[k] = row[k];
  return out;
}

export async function runReminders(
  sb: SupabaseClient,
  opts: { today?: string; rules?: ReminderRule[]; statusWrites?: StatusWrite[] } = {},
): Promise<RemindersTally> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const tally: RemindersTally = { rules: 0, rows_read: 0, events_new: 0, status_writes: {}, truncated: [], errors: [] };

  for (const rule of opts.rules ?? REMINDERS) {
    tally.rules++;
    const read = await readAllPages<Record<string, unknown>>((from, to) => rule.query(sb, from, to, today));
    if (read.error) { tally.errors.push(`${rule.id}: ${read.error}`); continue; }
    if (read.truncated) tally.truncated.push(rule.id);
    tally.rows_read += read.rows.length;

    const events: Record<string, unknown>[] = [];
    for (const row of read.rows) {
      const due = rule.dueDateOf(row, today);
      if (!due) continue;
      const bucket = bucketFor(due, today);
      if (!bucket || !wanted(bucket, rule.buckets)) continue;
      const slim = slimRow(row, rule.select);
      events.push({
        company_id:  rule.companyOf ? rule.companyOf(row) : (row.company_id as string | null) ?? null,
        entity_type: rule.entity,
        entity_id:   row.id,
        event_type:  'reminder',
        payload:     { bucket, due_date: due, row: slim },
        actor_id:    null,
        actor_kind:  'system',
        dedupe_key:  `reminder:${rule.entity}:${row.id}:${bucket}`,
      });
    }

    for (let i = 0; i < events.length; i += CHUNK) {
      const { data, error } = await sb.from('platform_events')
        .upsert(events.slice(i, i + CHUNK), { onConflict: 'dedupe_key', ignoreDuplicates: true })
        .select('id');
      if (error) { tally.errors.push(`${rule.id} emit: ${error.message}`); break; }
      tally.events_new += (data ?? []).length;
    }
  }

  for (const w of opts.statusWrites ?? STATUS_WRITES) {
    const { error, count } = await w.apply(sb, today);
    if (error) tally.errors.push(`${w.id}: ${error.message}`);
    else tally.status_writes[w.id] = count ?? 0;
  }

  return tally;
}
