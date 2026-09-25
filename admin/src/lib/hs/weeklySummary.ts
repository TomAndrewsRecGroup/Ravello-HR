import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { daysUntil } from './recurrence';
import { HS_ACTIVITY_TYPE_LABELS, type HsActivityType } from './vocab';
import { fallbackAttention, rankQuestions, HS_ATTENTION_LEVELS, type HsAttentionLevel, type RankItemState } from './jevQuestions';
import { HS_FAILED_CHECK_ACTION_TYPE, HS_ACTIONS_RAISED_ACTION_TYPE } from '@/lib/events/hsRules';
import { askJev, markActed } from '@/lib/jev/client';
import { readPreferences } from '@/lib/notify/notify';
import { sendKeyedEmail } from '@/lib/notify/keyedEmail';
import { clientWeeklySummaryEmail, type WeeklyActivity, type WeeklyCompanySection, type WeeklyItem } from '@/lib/email/templates/hsWeekly';
import { portalUrl } from '@/lib/portalUrl';

// Monday 07:00: one summary per client (their own register) for admins
// whose weekly_summary preference is on and whose PROTECT flag is not
// off. Claimed per recipient per ISO week through email_log's dedupe
// key, so a re-run of the cron sends nothing twice.
//
// Ordering "needs attention first" is the one place Jev may act on
// its own: it changes the order of three lines in an email and writes
// nothing to a row. Off or unsure, the deterministic fallback orders
// them, and both are recorded so their agreement can be measured.

export interface WeeklyTally {
  clients: number; emailed: number; skipped_already: number; email_failures: number; jev_ranked: number; errors: string[];
}

export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

interface ItemRow { id: string; company_id: string; title: string; category: string | null; status: string; due_date: string | null; recurrence_every: number | null; recurrence_unit: string | null; legal_basis: string | null }
interface CompletionRow { item_id: string; outcome: string; completed_on: string }
interface ActionRow { company_id: string; title: string; priority: string; created_at: string; action_type: string }

const ATTENTION_ORDER: Record<HsAttentionLevel, number> = { critical: 0, priority: 1, soon: 2, routine: 3 };

export async function buildCompanySection(sb: SupabaseClient, companyId: string, companyName: string, today: string): Promise<WeeklyCompanySection & { rankedByJev: boolean }> {
  const [items, completions, actions, files] = await Promise.all([
    readAllPages<ItemRow>((from, to) => sb.from('compliance_items').select('id, company_id, title, category, status, due_date, recurrence_every, recurrence_unit, legal_basis')
      .eq('company_id', companyId).eq('domain', 'hs').neq('status', 'complete').order('id').range(from, to)),
    readAllPages<CompletionRow>((from, to) => sb.from('hs_register_completions').select('item_id, outcome, completed_on')
      .eq('company_id', companyId).order('completed_on', { ascending: false }).order('id').range(from, to)),
    readAllPages<ActionRow>((from, to) => sb.from('actions').select('company_id, title, priority, created_at, action_type')
      .eq('company_id', companyId).eq('status', 'active').in('action_type', [HS_FAILED_CHECK_ACTION_TYPE, HS_ACTIONS_RAISED_ACTION_TYPE, 'hs_followup']).order('id').range(from, to)),
    readAllPages<{ entity_id: string }>((from, to) => sb.from('hs_files').select('entity_id').eq('company_id', companyId).eq('entity_type', 'register_item').order('id').range(from, to)),
  ]);
  const latest = new Map<string, CompletionRow>();
  for (const c of completions.rows) if (!latest.has(c.item_id)) latest.set(c.item_id, c);
  const evidence = new Map<string, number>();
  for (const f of files.rows) evidence.set(f.entity_id, (evidence.get(f.entity_id) ?? 0) + 1);

  const dated = items.rows.filter(i => i.due_date);
  const states: RankItemState[] = dated.map(i => ({
    category: i.category, days_overdue: -daysUntil(i.due_date!, today),
    recurrence_months: i.recurrence_unit === 'month' ? i.recurrence_every : i.recurrence_unit === 'year' ? (i.recurrence_every ?? 0) * 12 : i.recurrence_unit === 'week' ? Math.round((i.recurrence_every ?? 0) / 4) : null,
    last_outcome: latest.get(i.id)?.outcome ?? null, evidence_count: evidence.get(i.id) ?? 0, legal_basis_present: !!i.legal_basis,
  }));

  let attention: HsAttentionLevel[] = states.map(fallbackAttention);
  let rankedByJev = false;
  if (states.length > 0 && states.length <= 40) {
    const r = await askJev(sb, {
      kind: 'hs_register_rank', companyId, entityType: 'company', entityId: companyId, actor: { id: null, kind: 'system' },
      state: { items: states }, questions: rankQuestions(states), gate: 0.6,
    });
    if (r && !r.gated) {
      attention = states.map((_, i) => {
        const a = r.answers[`item_${i}`];
        return a?.type === 'score' && (HS_ATTENTION_LEVELS as readonly string[]).includes(a.selected) ? a.selected as HsAttentionLevel : attention[i];
      });
      rankedByJev = true;
      await markActed(sb, 'hs_register_rank', r.decisionId, 'weekly digest order');
    }
  }

  const weekly: WeeklyItem[] = dated.map((i, idx) => ({ title: i.title, due_date: i.due_date, attention: attention[idx], overdue: daysUntil(i.due_date!, today) < 0 }));
  const overdue = weekly.filter(w => w.overdue);
  const dueSoon = weekly.filter(w => !w.overdue && daysUntil(w.due_date!, today) <= 30);
  const topAttention = [...weekly].sort((a, b) => ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention] || (a.due_date ?? '').localeCompare(b.due_date ?? '')).slice(0, 3)
    .filter(w => w.attention !== 'routine');
  return {
    companyName, overdue, dueSoon, topAttention, rankedByJev,
    openActions: actions.rows.map(a => ({ title: a.title, priority: a.priority, created_at: a.created_at })),
  };
}

export async function runWeeklySummary(sb: SupabaseClient, opts: { now?: Date } = {}): Promise<WeeklyTally> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const week = isoWeek(now);
  const weekLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const tally: WeeklyTally = { clients: 0, emailed: 0, skipped_already: 0, email_failures: 0, jev_ranked: 0, errors: [] };
  const sections = new Map<string, WeeklyCompanySection & { rankedByJev: boolean }>();
  const sectionFor = async (companyId: string, name: string) => {
    if (!sections.has(companyId)) {
      const s = await buildCompanySection(sb, companyId, name, today);
      if (s.rankedByJev) tally.jev_ranked++;
      sections.set(companyId, s);
    }
    return sections.get(companyId)!;
  };
  const record = (r: { outcome: string; error: string | null }, who: string) => {
    if (r.outcome === 'sent') tally.emailed++;
    else if (r.outcome === 'already') tally.skipped_already++;
    else { tally.email_failures++; tally.errors.push(`${who}: ${r.error}`); }
  };

  // ── clients ──
  const { data: companies, error: cErr } = await sb.from('companies').select('id, name, feature_flags').eq('active', true);
  if (cErr) tally.errors.push(`companies: ${cErr.message}`);
  for (const co of (companies ?? []) as { id: string; name: string; feature_flags: Record<string, unknown> | null }[]) {
    const flags = co.feature_flags ?? {};
    if (flags.protect === false) continue;
    const { data: admins } = await sb.from('profiles').select('id, email').eq('company_id', co.id).eq('role', 'client_admin');
    const recipients = ((admins ?? []) as { id: string; email: string | null }[]).filter(a => a.email);
    if (recipients.length === 0) continue;
    const prefs = await readPreferences(sb, recipients.map(a => a.id));
    const wanting = recipients.filter(a => (prefs.get(a.id)?.weekly_summary ?? true) && (prefs.get(a.id)?.email_mode ?? 'immediate') !== 'off');
    if (wanting.length === 0) continue;
    const section = await sectionFor(co.id, co.name);
    // Nothing on the register and nothing logged: no email, not an empty one.
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: acts } = await sb.from('hs_activities').select('title, activity_type, occurred_on').eq('company_id', co.id).gte('occurred_on', since).order('occurred_on', { ascending: false }).limit(20);
    const activities: WeeklyActivity[] = ((acts ?? []) as { title: string; activity_type: string; occurred_on: string }[])
      .map(a => ({ title: a.title, type_label: HS_ACTIVITY_TYPE_LABELS[a.activity_type as HsActivityType] ?? a.activity_type, occurred_on: a.occurred_on, provider: 'Core OS 360' }));
    if (section.overdue.length + section.dueSoon.length + section.openActions.length + activities.length === 0) continue;
    tally.clients++;
    const message = clientWeeklySummaryEmail({ section, weekLabel, activities, registerUrl: `${portalUrl()}/protect/compliance` });
    for (const a of wanting) {
      const r = await sendKeyedEmail(sb, { dedupeKey: `digest:client:${a.id}:${week}`, to: a.email!, subject: message.subject, html: message.html, tag: message.tag, target: { type: 'user', id: a.id, profileId: a.id }, companyId: co.id });
      record(r, `client ${a.id}`);
    }
  }
  return tally;
}
