import type { SupabaseClient } from '@supabase/supabase-js';
import { notify, type NotifyTally } from '@/lib/notify/notify';
import { sendKeyedEmail } from '@/lib/notify/keyedEmail';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { RULES, rulesFor, type Consequence, type Rule, type RuleContext } from './rules';
import { eventKey, type PlatformEvent } from './types';

// The one consumer of platform_events. Runs with the service role,
// every five minutes and inline after the reminders cron.
//
//   claim (SKIP LOCKED, leased, ≤5 attempts)
//     → for each rule on the event's key whose `when` passes
//       → run each consequence, idempotent by `${rule}:${event}:${i}`
//     → processed_at
//
// A consequence that throws marks the event with last_error and
// leaves it claimed; the lease expires and the next run retries it,
// up to five times, after which it shows on /automation. Consequences
// already carried out on the earlier attempt are no-ops the second
// time because every one of them is keyed.

export interface ProcessTally {
  claimed:        number;
  processed:      number;
  failed:         number;
  consequences:   number;
  notified:       number;
  emailed:        number;
  email_failures: number;
  errors:         string[];
}

export const emptyProcessTally = (): ProcessTally => ({
  claimed: 0, processed: 0, failed: 0, consequences: 0, notified: 0, emailed: 0, email_failures: 0, errors: [],
});

export interface ProcessOptions {
  limit?:      number;
  /** Stop claiming new batches after this many ms; the run is not a failure. */
  deadlineMs?: number;
  rules?:      Rule[];
  leaseSeconds?: number;
  now?:        () => number;
}

export async function processEvents(sb: SupabaseClient, opts: ProcessOptions = {}): Promise<ProcessTally> {
  const tally = emptyProcessTally();
  const rules = opts.rules ?? RULES;
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const now = opts.now ?? Date.now;
  const started = now();
  const deadline = opts.deadlineMs ?? 45_000;
  const lease = `${opts.leaseSeconds ?? 600} seconds`;

  for (;;) {
    if (now() - started > deadline) break;
    const { data, error } = await sb.rpc('claim_platform_events', { p_limit: limit, p_lease: lease });
    if (error) { tally.errors.push(`claim: ${error.message}`); break; }
    const events = (data ?? []) as PlatformEvent[];
    if (events.length === 0) break;
    tally.claimed += events.length;

    for (const event of events) {
      if (now() - started > deadline) return tally;
      try {
        await processOne(sb, event, rules, tally);
        const done = await sb.from('platform_events').update({ processed_at: new Date().toISOString(), last_error: null }, COUNT_EXACT).eq('id', event.id);
        const outcome = judgeWrite({ error: done.error, count: done.count }, 'processed_at');
        if (!outcome.ok) throw new Error(outcome.message ?? 'processed_at not written');
        tally.processed++;
      } catch (err) {
        const message = (err as Error).message ?? String(err);
        tally.failed++;
        tally.errors.push(`event ${event.id} (${eventKey(event)}): ${message}`);
        await sb.from('platform_events').update({ last_error: message.slice(0, 1_000) }, COUNT_EXACT).eq('id', event.id);
      }
    }
    if (events.length < limit) break;
  }
  return tally;
}

function makeContext(sb: SupabaseClient, event: PlatformEvent): RuleContext {
  let company: Promise<string> | null = null;
  const profiles = new Map<string, Promise<{ email: string | null; full_name: string | null } | null>>();
  return {
    sb, event,
    companyName: () => {
      if (!company) {
        company = (async () => {
          if (!event.company_id) return '';
          const { data } = await sb.from('companies').select('name').eq('id', event.company_id).maybeSingle();
          return (data as { name?: string } | null)?.name ?? '';
        })();
      }
      return company;
    },
    profile: (id) => {
      if (!profiles.has(id)) {
        profiles.set(id, (async () => {
          const { data } = await sb.from('profiles').select('email, full_name').eq('id', id).maybeSingle();
          return (data as { email: string | null; full_name: string | null } | null) ?? null;
        })());
      }
      return profiles.get(id)!;
    },
  };
}

async function processOne(sb: SupabaseClient, event: PlatformEvent, rules: Rule[], tally: ProcessTally): Promise<void> {
  const ctx = makeContext(sb, event);
  for (const rule of rulesFor(eventKey(event), rules)) {
    if (rule.when && !rule.when(event)) continue;
    const consequences = await rule.then(ctx);
    for (let i = 0; i < consequences.length; i++) {
      const key = `${rule.id}:${event.id}:${i}`;
      const t = await runConsequence(sb, event, consequences[i], key);
      tally.consequences++;
      if (t) { tally.notified += t.notified; tally.emailed += t.emailed; tally.email_failures += t.email_failures; }
    }
  }
}

export async function runConsequence(sb: SupabaseClient, event: PlatformEvent, c: Consequence, key: string): Promise<NotifyTally | null> {
  switch (c.kind) {
    case 'notify':
      return notify(sb, { ...c.input, dedupeKey: key, eventId: event.id });
    case 'email': {
      const r = await sendKeyedEmail(sb, {
        dedupeKey: key, to: c.to, subject: c.message.subject, html: c.message.html, tag: c.message.tag,
        target: c.target, companyId: event.company_id,
      });
      return { recipients: 1, notified: 0, emailed: r.outcome === 'sent' ? 1 : 0, email_failures: r.outcome === 'failed' ? 1 : 0 };
    }
    case 'run':
      await c.fn(sb);
      return null;
    case 'action':
      await createKeyedAction(sb, c);
      return null;
  }
}

/** Insert an action once per (company, source_ref); a re-run finds the
 *  unique index and creates nothing. */
async function createKeyedAction(sb: SupabaseClient, c: Extract<Consequence, { kind: 'action' }>): Promise<void> {
  const { error } = await sb.from('actions').upsert({
    company_id: c.companyId, source_ref: c.sourceRef, status: 'active',
    action_type: c.row.action_type, title: c.row.title.slice(0, 200), description: c.row.description ?? null,
    priority: c.row.priority, related_entity_type: c.row.related_entity_type ?? null, related_entity_id: c.row.related_entity_id ?? null,
    due_date: c.row.due_date ?? null, created_by_admin: c.row.created_by_admin ?? true,
  }, { onConflict: 'company_id,source_ref', ignoreDuplicates: true });
  if (error) throw new Error(`action upsert: ${error.message}`);
}
