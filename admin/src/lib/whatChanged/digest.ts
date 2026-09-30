import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { computeWhatChanged, type PlatformEventRow, type WhatChangedSummary } from './compute';
import { filterClientVisible } from './clientScope';
import { sendKeyedEmail } from '@/lib/notify/keyedEmail';
import { whatChangedDigestEmail } from '@/lib/email/templates/whatChangedDigest';
import { isoWeek } from '@/lib/hs/weeklySummary';
import { portalUrl } from '@/lib/portalUrl';

// Core-OS 360 Completion Programme, Phase 25, Group 5 (closes gap-ledger
// row C9.5 — "scheduled daily/period digest with preference/role
// controls + dedup"). Scheduled at 07:10 UTC daily — after
// health-snapshot (06:45) and digest (07:00), the same ordering
// discipline every prior cron addition in this file follows.
//
// ONE cron handles both 'daily' and 'weekly' preference values,
// deliberately unlike weekly-summary's own SEPARATE Monday-only
// schedule: the two modes share the same event source, the same
// computeWhatChanged()/filterClientVisible() pipeline and the same
// email template, differing only in window length and recipient set
// (already partitioned by the preference value itself) — splitting
// them into two routes would duplicate that shared machinery for no
// real benefit. `isMonday` gates the weekly half exactly the way the
// H&S weekly digest's own external Monday-only schedule does, just
// checked in code instead of in Vercel's cron config.
//
// Claim-before-send throughout (sendKeyedEmail, the Phase 6 Service
// Ledger / H&S weekly digest precedent): a re-run of this cron for the
// same recipient and the same period sends nothing twice. "Nothing to
// report -> no email, not an empty one" (the weekly-summary rule) —
// a recipient whose window has zero client-visible events is skipped
// before any claim is attempted.

export interface WhatChangedDigestTally {
  daily_candidates: number;
  weekly_candidates: number;
  emailed: number;
  skipped_already: number;
  skipped_nothing_changed: number;
  email_failures: number;
  errors: string[];
}

function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }
function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISODate(d);
}
function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

async function summaryForWindow(sb: SupabaseClient, companyId: string, startDay: string, endExclusiveDay: string, label: string): Promise<WhatChangedSummary> {
  const dayStart = `${startDay}T00:00:00.000Z`;
  const dayEnd = `${endExclusiveDay}T00:00:00.000Z`;
  const result = await readAllPages<PlatformEventRow>((from, to) =>
    sb.from('platform_events').select('entity_type, event_type, actor_kind')
      .eq('company_id', companyId).gte('occurred_at', dayStart).lt('occurred_at', dayEnd)
      .order('id').range(from, to));
  if (result.error) throw new Error(`platform_events read for ${companyId}: ${result.error}`);
  return computeWhatChanged(filterClientVisible(result.rows), label);
}

export async function runWhatChangedDigest(sb: SupabaseClient, opts: { now?: Date } = {}): Promise<WhatChangedDigestTally> {
  const now = opts.now ?? new Date();
  const today = toISODate(now);
  const yesterday = shiftDay(today, -1);
  const isMonday = now.getUTCDay() === 1;
  const weekStart = shiftDay(yesterday, -6);
  const week = isoWeek(now);

  const tally: WhatChangedDigestTally = {
    daily_candidates: 0, weekly_candidates: 0, emailed: 0, skipped_already: 0, skipped_nothing_changed: 0, email_failures: 0, errors: [],
  };
  const record = (r: { outcome: string; error: string | null }, who: string) => {
    if (r.outcome === 'sent') tally.emailed++;
    else if (r.outcome === 'already') tally.skipped_already++;
    else { tally.email_failures++; tally.errors.push(`${who}: ${r.error}`); }
  };

  // Candidates: only users who have genuinely opted in — 'off' is the
  // default (migration 193), so this is almost always a small set, not
  // every client_admin in the system.
  const modes = isMonday ? ['daily', 'weekly'] : ['daily'];
  const prefResult = await readAllPages<{ user_id: string; what_changed_digest: string }>((from, to) =>
    sb.from('notification_preferences').select('user_id, what_changed_digest').in('what_changed_digest', modes).order('user_id').range(from, to));
  if (prefResult.error) { tally.errors.push(`notification_preferences: ${prefResult.error}`); return tally; }
  if (prefResult.rows.length === 0) return tally;

  const modeByUser = new Map(prefResult.rows.map(p => [p.user_id, p.what_changed_digest]));

  // Fetch by id list (never a chained embed) — the established rule
  // this codebase learned the hard way from the referral route's own
  // PGRST200. client_admin only, and only those with a real company —
  // the same "admins only" scope Broadcast and the H&S weekly digest
  // already use.
  const { data: profileRows, error: pErr } = await sb.from('profiles')
    .select('id, email, company_id').eq('role', 'client_admin')
    .not('company_id', 'is', null).in('id', [...modeByUser.keys()]);
  if (pErr) { tally.errors.push(`profiles: ${pErr.message}`); return tally; }

  const dailyByCompany = new Map<string, WhatChangedSummary>();
  const weeklyByCompany = new Map<string, WhatChangedSummary>();
  async function dailyFor(companyId: string) {
    if (!dailyByCompany.has(companyId)) dailyByCompany.set(companyId, await summaryForWindow(sb, companyId, yesterday, today, yesterday));
    return dailyByCompany.get(companyId)!;
  }
  async function weeklyFor(companyId: string) {
    if (!weeklyByCompany.has(companyId)) weeklyByCompany.set(companyId, await summaryForWindow(sb, companyId, weekStart, today, `${weekStart} to ${yesterday}`));
    return weeklyByCompany.get(companyId)!;
  }

  for (const p of (profileRows ?? []) as { id: string; email: string | null; company_id: string }[]) {
    if (!p.email) continue;
    const mode = modeByUser.get(p.id);

    if (mode === 'daily') {
      tally.daily_candidates++;
      const summary = await dailyFor(p.company_id);
      if (summary.totalEvents === 0) { tally.skipped_nothing_changed++; continue; }
      const msg = whatChangedDigestEmail({
        summary, periodLabel: `yesterday, ${fmtDay(yesterday)}`, frequency: 'daily',
        whatChangedUrl: `${portalUrl()}/protect/what-changed?day=${yesterday}`,
      });
      const r = await sendKeyedEmail(sb, {
        dedupeKey: `what-changed-digest:daily:${p.id}:${yesterday}`, to: p.email, subject: msg.subject, html: msg.html, tag: msg.tag,
        target: { type: 'user', id: p.id, profileId: p.id }, companyId: p.company_id,
      });
      record(r, `daily ${p.id}`);
    }

    if (mode === 'weekly') {
      tally.weekly_candidates++;
      const summary = await weeklyFor(p.company_id);
      if (summary.totalEvents === 0) { tally.skipped_nothing_changed++; continue; }
      const msg = whatChangedDigestEmail({
        summary, periodLabel: `the week of ${fmtDay(weekStart)}`, frequency: 'weekly',
        whatChangedUrl: `${portalUrl()}/protect/what-changed`,
      });
      const r = await sendKeyedEmail(sb, {
        dedupeKey: `what-changed-digest:weekly:${p.id}:${week}`, to: p.email, subject: msg.subject, html: msg.html, tag: msg.tag,
        target: { type: 'user', id: p.id, profileId: p.id }, companyId: p.company_id,
      });
      record(r, `weekly ${p.id}`);
    }
  }

  return tally;
}
