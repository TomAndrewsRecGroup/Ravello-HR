import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { askJev } from '@/lib/jev/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { createKeyedInternalTask, staffOwnerFor } from '@/lib/events/supportRules';
import { BD_NEED, BD_NEXT_ACTIONS, fallbackNextAction, prospectScore, type BdNextAction, type ProspectSignals } from './prospectScore';

// Sunday 06:00: every tracked prospect is scored from what our own scans
// saw (bd_scanned_roles), Jev picks the next action from those NUMBERS,
// and the top few "call" prospects become tasks on the owner's board —
// at most MAX_CALL_TASKS a run, one per prospect per month.
//
// Until 2026-09-25 this also merged a live IvyLens leads feed into the
// score; that integration is gone (BD Intelligence and BD Roles, the
// two pages it fed, are removed). bd_companies is now populated purely
// by the Enquiry "Convert to prospect" flow, so scoring is honest about
// a smaller, internally-sourced set — the number of prospects reflects
// what the business has actually flagged, not what a scan surfaced.

export const MAX_CALL_TASKS = 5;
export const BD_JEV_GATE = 0.6;

export interface BdScoreTally { prospects: number; scored: number; jev_answered: number; call_tasks: number; errors: string[] }

export function bdNextActionQuestions() {
  return {
    next_action: { type: 'choice' as const, instructions: 'The state is a set of numbers about one company seen advertising jobs: roles seen, roles still live, days since last seen, counts of reposted and long-open roles, whether they are hiring in volume, our prior status with them (prospect, contacted) and a deterministic prospect score 0–100. For a UK recruitment and HR consultancy deciding outreach, what is the right next step?', criteria: { call: 'Phone them this week', email_sequence: 'Start an email sequence', watch: 'Keep watching, no contact yet', dismiss: 'Not worth pursuing' } },
    need_now:    { type: 'score'  as const, instructions: 'From the same numbers, how much do they need hiring help right now?', criteria: [...BD_NEED] },
  };
}

export async function runBdScore(sb: SupabaseClient, opts: { now?: Date } = {}): Promise<BdScoreTally> {
  const now = opts.now ?? new Date();
  const month = now.toISOString().slice(0, 7);
  const tally: BdScoreTally = { prospects: 0, scored: 0, jev_answered: 0, call_tasks: 0, errors: [] };

  const companies = await readAllPages<{ id: string; company_name: string; company_name_normalised: string; status: string; total_roles_seen: number; last_seen_at: string; notes: string | null; outreach_status: string | null }>((from, to) =>
    sb.from('bd_companies').select('id, company_name, company_name_normalised, status, total_roles_seen, last_seen_at, notes, outreach_status').order('id').range(from, to));
  if (companies.error) { tally.errors.push(`bd_companies: ${companies.error}`); return tally; }
  tally.prospects = companies.rows.length;
  if (companies.rows.length === 0) return tally;

  const roles = await readAllPages<{ company_id: string; still_active: boolean | null }>((from, to) =>
    sb.from('bd_scanned_roles').select('company_id, still_active').order('id').range(from, to));
  if (roles.error) tally.errors.push(`bd_scanned_roles: ${roles.error}`);
  const activeByCompany = new Map<string, number>();
  for (const r of roles.rows) if (r.still_active !== false) activeByCompany.set(r.company_id, (activeByCompany.get(r.company_id) ?? 0) + 1);

  const callCandidates: { id: string; name: string; score: number }[] = [];
  for (const c of companies.rows) {
    const lastSeen = c.last_seen_at ? Date.parse(c.last_seen_at) : NaN;
    const signals: ProspectSignals = {
      roles_seen: c.total_roles_seen ?? 0,
      active_roles: activeByCompany.get(c.id) ?? 0,
      days_since_last_seen: Number.isNaN(lastSeen) ? 365 : Math.max(0, Math.round((now.getTime() - lastSeen) / 86_400_000)),
      // No live scan-derived friction signal any more (see file header):
      // the fallback and prospectScore() treat an absent signal as zero,
      // never as "unknown", which is the same honest degrade the rest
      // of this platform uses for sparse data.
      high_repost: 0, long_vacancy: 0, volume_hiring: 0,
      prior_status: c.status ?? 'prospect', prior_contacts: c.outreach_status ? 1 : 0,
    };
    const score = prospectScore(signals);
    let next: BdNextAction = fallbackNextAction(signals, score);
    const r = await askJev(sb, {
      kind: 'bd_next_action', companyId: null, entityType: 'bd_company', entityId: c.id,
      actor: { id: null, kind: 'system' }, flags: null, state: { ...signals, prospect_score: score }, questions: bdNextActionQuestions(), gate: BD_JEV_GATE,
    });
    if (r && !r.gated && r.answers.next_action?.type === 'choice' && (BD_NEXT_ACTIONS as readonly string[]).includes(r.answers.next_action.selected)) {
      next = r.answers.next_action.selected as BdNextAction;
      tally.jev_answered++;
    }
    const res = await sb.from('bd_companies').update({ prospect_score: score, next_action: next, scored_at: now.toISOString(), score_inputs: { ...signals, jev: r ? { decision_id: r.decisionId, gated: r.gated, confidence: r.confidence } : null } }, COUNT_EXACT).eq('id', c.id);
    const w = judgeWrite({ error: res.error, count: res.count });
    if (!w.ok) { tally.errors.push(`${c.id}: ${w.message}`); continue; }
    tally.scored++;
    if (next === 'call') callCandidates.push({ id: c.id, name: c.company_name, score });
  }

  callCandidates.sort((a, b) => b.score - a.score);
  const assignee = await staffOwnerFor(sb, null);
  for (const c of callCandidates.slice(0, MAX_CALL_TASKS)) {
    const created = await createKeyedInternalTask(sb, {
      company_id: null, assigned_to: assignee, title: `Call ${c.name}`,
      description: `Prospect score ${c.score}.`,
      priority: c.score >= 80 ? 'high' : 'normal', due_date: new Date(now.getTime() + 5 * 86_400_000).toISOString().slice(0, 10),
      source_ref: `bd_call:${c.id}:${month}`,
    });
    if (created) tally.call_tasks++;
  }
  return tally;
}
