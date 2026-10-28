// The Thursday run: snapshot the live roles, resolve the athletes,
// claim each delivery, send over Tom's SMTP, record the outcome.
//
// Idempotent and resumable by construction:
//   * one `a2i_role_alert_sends` row per London ISO week (UNIQUE) — the
//     email goes out at most once a week however many times this runs;
//   * one delivery per (send, email) (UNIQUE), claimed pending→sending
//     with a counted conditional update BEFORE the send — two runs can
//     never both send to the same person;
//   * a run that runs out of time leaves the rest `pending`, and the
//     next 15-minute cron tick (or "Send now") carries on from there.
//
// A delivery left in `sending` (the process died mid-send) is NEVER
// re-sent automatically — whether it went is unknowable — it is marked
// failed with that explanation, and "Retry failed" is a human decision.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken } from '@/lib/auth/accessTokens';
import { createSmtpSession, type SmtpCreds, type SmtpSession } from '@/lib/email/smtp';
import { sendEmail, lastEmailError } from '@/lib/email';
import { wrapEmailA2I, A2I } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/email/templates/notification';
import { sendKeyedEmail } from '@/lib/notify/keyedEmail';
import { COUNT_EXACT } from '@/lib/supabase/mutations';
import { readAllPages } from '@/lib/supabase/paged';
import { buildRoleAlertEmail } from './email';
import type { LiveRole } from './format';
import { loadLiveRoles, type ListJobs, type LookupOrgName } from './live';
import { firstName, resolveRecipients, type AthleteForRecipients, type Recipient } from './recipients';
import { isFinalAttempt, isSendWindow, londonWeekKey } from './schedule';
import { loadSender, type SenderResult } from './sender';

export const TOKEN_TTL_DAYS = 30;
const DEFAULT_BUDGET_MS = 240_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const STUCK_SENDING_MS = 10 * 60_000;

export interface RoleAlertConfig {
  id:                string;
  enabled:           boolean;
  recipient_mode:    'all' | 'selected';
  sender_profile_id: string | null;
  role_url_template: string;
  notify_email:      string;
  updated_by:        string | null;
}

export interface RoleAlertSend {
  id:            string;
  week_key:      string;
  status:        'pending' | 'sending' | 'complete' | 'no_roles' | 'failed';
  jobs:          LiveRole[] | null;
  alerted_at:    string | null;
}

export async function loadConfig(sb: SupabaseClient): Promise<RoleAlertConfig | null> {
  const { data } = await sb.from('a2i_role_alert_config')
    .select('id, enabled, recipient_mode, sender_profile_id, role_url_template, notify_email, updated_by')
    .eq('singleton', true)
    .maybeSingle();
  return (data as RoleAlertConfig | null) ?? null;
}

/** Everyone who would receive this week's email right now. */
export async function loadRecipients(sb: SupabaseClient, config: RoleAlertConfig): Promise<{ recipients: Recipient[]; error: string | null }> {
  const [athletes, selected, optouts] = await Promise.all([
    readAllPages<AthleteForRecipients>((from, to) =>
      sb.from('athletes').select('id, full_name, email, company_id').order('id').range(from, to)),
    config.recipient_mode === 'selected'
      ? readAllPages<{ id: string; athlete_id: string }>((from, to) =>
          sb.from('a2i_role_alert_recipients').select('id, athlete_id').order('id').range(from, to))
      : Promise.resolve({ rows: [] as Array<{ id: string; athlete_id: string }>, error: null }),
    readAllPages<{ id: string; email_lower: string }>((from, to) =>
      sb.from('a2i_role_alert_optouts').select('id, email_lower').order('id').range(from, to)),
  ]);
  const error = athletes.error ?? selected.error ?? optouts.error;
  if (error) return { recipients: [], error };
  return {
    recipients: resolveRecipients(
      athletes.rows,
      config.recipient_mode,
      selected.rows.map(r => r.athlete_id),
      optouts.rows.map(r => r.email_lower),
    ),
    error: null,
  };
}

export interface RunDeps {
  listJobs?:  ListJobs;
  orgName?:   LookupOrgName;
  openSmtp?:  (creds: SmtpCreds) => SmtpSession;
  loadSender?: (sb: SupabaseClient, profileId: string | null) => Promise<SenderResult>;
  mintToken?: () => string;
  /** Tom's internal alerts (Resend). Injected in tests. */
  alert?:     (sb: SupabaseClient, config: RoleAlertConfig, send: RoleAlertSend, subject: string, message: string) => Promise<void>;
  budgetMs?:  number;
  clock?:     () => number;
}

export interface RunOptions {
  now:          Date;
  trigger:      'cron' | 'manual';
  triggeredBy?: string | null;
  deps?:        RunDeps;
}

export interface RunTally {
  week_key?:       string;
  skipped?:        'no_config' | 'disabled' | 'outside_window' | 'already_sent';
  status?:         RoleAlertSend['status'];
  roles?:          number;
  recipients?:     number;
  sent_this_run:   number;
  failed_this_run: number;
  skipped_this_run: number;
  remaining?:      number;
  error?:          string | null;
}

export interface RunResult { tally: RunTally; degraded: boolean; error?: string | null }

function trimError(s: string): string {
  return s.length > 1900 ? `${s.slice(0, 1900)}…` : s;
}

async function defaultAlert(sb: SupabaseClient, config: RoleAlertConfig, send: RoleAlertSend, subject: string, message: string): Promise<void> {
  const body = `<h1 style="margin:0 0 12px 0;font-size:20px;color:${A2I.cream};">${escapeHtml(subject)}</h1>
<p style="margin:0 0 12px 0;color:${A2I.cream};">${escapeHtml(message)}</p>
<p style="margin:0;color:${A2I.creamMut};font-size:13px;">Week ${escapeHtml(send.week_key)}. Open Athletes To Industry → Roles email in the admin app to see what happened and retry.</p>`;
  const html = wrapEmailA2I(body, subject);
  const targetId = config.sender_profile_id ?? config.updated_by;
  if (targetId) {
    await sendKeyedEmail(sb, {
      dedupeKey: `a2i-roles-alert:${send.id}`,
      to: config.notify_email, subject, html, tag: 'a2i-roles-alert',
      target: { type: 'user', id: targetId, profileId: targetId }, companyId: null,
    });
  } else {
    const res = await sendEmail({ to: config.notify_email, subject, html, tag: 'a2i-roles-alert' });
    if (!res) console.warn('[a2i-roles] alert not sent', lastEmailError());
  }
}

async function alertOnce(sb: SupabaseClient, config: RoleAlertConfig, send: RoleAlertSend, deps: RunDeps, subject: string, message: string) {
  if (send.alerted_at) return;
  // Claim the alert on the send row so it goes once, however many ticks fail.
  const { count } = await sb.from('a2i_role_alert_sends')
    .update({ alerted_at: new Date().toISOString() }, COUNT_EXACT)
    .eq('id', send.id).is('alerted_at', null);
  if (!count) return;
  send.alerted_at = new Date().toISOString();
  try {
    await (deps.alert ?? defaultAlert)(sb, config, send, subject, message);
  } catch (err) {
    console.error('[a2i-roles] alert failed', (err as Error).message);
  }
}

async function recordFailure(sb: SupabaseClient, send: RoleAlertSend, message: string) {
  await sb.from('a2i_role_alert_sends').update({ status: 'failed', error: trimError(message) }, COUNT_EXACT).eq('id', send.id);
  send.status = 'failed';
}

export async function runRoleAlert(sb: SupabaseClient, opts: RunOptions): Promise<RunResult> {
  const deps = opts.deps ?? {};
  const clock = deps.clock ?? (() => Date.now());
  const startedAt = clock();
  const budgetMs = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const tally: RunTally = { sent_this_run: 0, failed_this_run: 0, skipped_this_run: 0 };

  const config = await loadConfig(sb);
  if (!config) return { tally: { ...tally, skipped: 'no_config' }, degraded: true, error: 'Role email config row is missing' };
  if (opts.trigger === 'cron') {
    if (!config.enabled) return { tally: { ...tally, skipped: 'disabled' }, degraded: false };
    if (!isSendWindow(opts.now)) return { tally: { ...tally, skipped: 'outside_window' }, degraded: false };
  }

  const weekKey = londonWeekKey(opts.now);
  tally.week_key = weekKey;

  // ── The week's send row (one per week, by the UNIQUE constraint) ──
  const { error: upsertErr } = await sb.from('a2i_role_alert_sends').upsert({
    week_key: weekKey, status: 'pending', trigger: opts.trigger, triggered_by: opts.triggeredBy ?? null,
  }, { onConflict: 'week_key', ignoreDuplicates: true });
  if (upsertErr) return { tally, degraded: true, error: `Could not open this week's send: ${upsertErr.message}` };
  const { data: sendRow, error: sendErr } = await sb.from('a2i_role_alert_sends')
    .select('id, week_key, status, jobs, alerted_at').eq('week_key', weekKey).single();
  if (sendErr || !sendRow) return { tally, degraded: true, error: `Could not read this week's send: ${sendErr?.message ?? 'missing'}` };
  const send = sendRow as RoleAlertSend;

  if (send.status === 'complete' || send.status === 'no_roles') {
    return { tally: { ...tally, skipped: 'already_sent', status: send.status }, degraded: false };
  }

  const finalAttempt = opts.trigger === 'cron' && isFinalAttempt(opts.now);

  // ── Snapshot the roles once; a resumed run sends the same list ──
  let roles = send.jobs;
  if (!roles) {
    const live = await loadLiveRoles(sb, opts.now, {
      listJobs: deps.listJobs, orgName: deps.orgName, deadline: startedAt + Math.min(60_000, budgetMs),
    });
    if (live.error) {
      const msg = `Manatal: ${live.error}. Nothing was sent; the next run will try again.`;
      await recordFailure(sb, send, msg);
      if (finalAttempt) await alertOnce(sb, config, send, deps, 'Thursday roles email did not go out', msg);
      return { tally: { ...tally, status: 'failed', error: msg }, degraded: true, error: msg };
    }
    if (live.roles.length === 0) {
      await sb.from('a2i_role_alert_sends').update({
        status: 'no_roles', jobs: [], job_count: 0, completed_at: new Date().toISOString(), error: null,
      }, COUNT_EXACT).eq('id', send.id);
      return { tally: { ...tally, status: 'no_roles', roles: 0 }, degraded: false };
    }
    roles = live.roles;
    await sb.from('a2i_role_alert_sends').update({
      jobs: roles, job_count: roles.length, status: 'sending', started_at: new Date().toISOString(), error: null,
    }, COUNT_EXACT).eq('id', send.id);
  }
  tally.roles = roles.length;

  // ── Sender: Tom's own SMTP. Verified before a single email is built ──
  const sender = await (deps.loadSender ?? loadSender)(sb, config.sender_profile_id);
  if (!sender.ok) {
    await recordFailure(sb, send, sender.error);
    if (opts.trigger === 'manual' || finalAttempt) await alertOnce(sb, config, send, deps, 'Thursday roles email could not send', sender.error);
    return { tally: { ...tally, status: 'failed', error: sender.error }, degraded: true, error: sender.error };
  }
  const session = (deps.openSmtp ?? createSmtpSession)(sender.creds);
  try {
    const verified = await session.verify();
    if (!verified.ok) {
      const msg = `SMTP login for ${sender.fromEmail} failed: ${verified.error}. Nothing was sent.`;
      await recordFailure(sb, send, msg);
      if (opts.trigger === 'manual' || finalAttempt) await alertOnce(sb, config, send, deps, 'Thursday roles email could not send', msg);
      return { tally: { ...tally, status: 'failed', error: msg }, degraded: true, error: msg };
    }
    await sb.from('a2i_role_alert_sends').update({
      status: 'sending', sender_profile_id: sender.profileId, sender_email: sender.fromEmail, error: null,
    }, COUNT_EXACT).eq('id', send.id);

    // ── Recipients: athletes only, opt-outs excluded, one per email ──
    const { recipients, error: recErr } = await loadRecipients(sb, config);
    if (recErr) {
      const msg = `Could not read the athlete list: ${recErr}`;
      await recordFailure(sb, send, msg);
      return { tally: { ...tally, status: 'failed', error: msg }, degraded: true, error: msg };
    }
    const eligible = new Map(recipients.map(r => [r.emailLower, r]));
    if (recipients.length) {
      const { error: insErr } = await sb.from('a2i_role_alert_deliveries').upsert(
        recipients.map(r => ({
          send_id: send.id, athlete_id: r.athleteId, email_lower: r.emailLower,
          full_name: r.fullName.slice(0, 300) || null, status: 'pending',
        })),
        { onConflict: 'send_id,email_lower', ignoreDuplicates: true },
      );
      if (insErr) {
        const msg = `Could not queue deliveries: ${insErr.message}`;
        await recordFailure(sb, send, msg);
        return { tally: { ...tally, status: 'failed', error: msg }, degraded: true, error: msg };
      }
    }

    // A delivery stuck in `sending` from a crashed run: never re-sent blind.
    const stuckBefore = new Date(clock() - STUCK_SENDING_MS).toISOString();
    await sb.from('a2i_role_alert_deliveries').update({
      status: 'failed', error: 'Interrupted mid-send; it may or may not have been delivered. Retry by hand if needed.',
    }, COUNT_EXACT).eq('send_id', send.id).eq('status', 'sending').lt('attempted_at', stuckBefore);

    const { data: pendingRows } = await sb.from('a2i_role_alert_deliveries')
      .select('id, athlete_id, email_lower, full_name')
      .eq('send_id', send.id).eq('status', 'pending')
      .order('created_at').limit(500);
    const pending = (pendingRows ?? []) as Array<{ id: string; athlete_id: string | null; email_lower: string; full_name: string | null }>;

    const { data: athleteRows } = pending.length
      ? await sb.from('athletes').select('id, company_id, email').in('id', pending.map(p => p.athlete_id).filter(Boolean) as string[]).limit(500)
      : { data: [] };
    const athleteById = new Map(((athleteRows ?? []) as Array<{ id: string; company_id: string | null; email: string | null }>).map(a => [a.id, a]));

    let consecutive = 0;
    const mint = deps.mintToken ?? (() => crypto.randomUUID());
    const expires = new Date(opts.now.getTime() + TOKEN_TTL_DAYS * 86_400_000).toISOString();

    for (const d of pending) {
      if (clock() - startedAt > budgetMs) break;
      const recipient = eligible.get(d.email_lower);
      if (!recipient || !d.athlete_id) {
        // Opted out, deselected or deleted since it was queued.
        await sb.from('a2i_role_alert_deliveries').update({ status: 'skipped', error: 'No longer on the recipient list' }, COUNT_EXACT)
          .eq('id', d.id).eq('status', 'pending');
        tally.skipped_this_run++;
        continue;
      }
      const { count: claimed } = await sb.from('a2i_role_alert_deliveries')
        .update({ status: 'sending', attempted_at: new Date(clock()).toISOString() }, COUNT_EXACT)
        .eq('id', d.id).eq('status', 'pending');
      if (!claimed) continue;   // another run has it

      const token = mint();
      const { error: tokErr } = await sb.from('a2i_role_alert_tokens').insert({
        token_hash: await hashAccessToken(token), delivery_id: d.id, send_id: send.id,
        athlete_id: d.athlete_id, email_lower: d.email_lower, expires_at: expires,
      });
      if (tokErr) {
        await sb.from('a2i_role_alert_deliveries').update({ status: 'failed', error: trimError(`Link could not be created: ${tokErr.message}`) }, COUNT_EXACT).eq('id', d.id);
        tally.failed_this_run++;
        if (++consecutive >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }

      const name = firstName(recipient.fullName);
      const email = buildRoleAlertEmail({ firstName: name, roles, token, roleUrlTemplate: config.role_url_template });
      const athlete = athleteById.get(d.athlete_id);
      const to = athlete?.email?.trim() || recipient.email;
      const res = await session.send({
        to,
        subject: email.subject,
        html: email.html,
        headers: {
          'List-Unsubscribe':      `<${email.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (res.ok) {
        consecutive = 0;
        tally.sent_this_run++;
        await sb.from('a2i_role_alert_deliveries').update({
          status: 'sent', message_id: res.messageId, sent_at: new Date().toISOString(), error: null,
        }, COUNT_EXACT).eq('id', d.id);
        // The athlete's email history, with the link token left OUT of the
        // stored copy (its Match me links point at the preview page).
        const logged = buildRoleAlertEmail({ firstName: name, roles, token: null, roleUrlTemplate: config.role_url_template });
        const { error: logErr } = await sb.from('email_log').insert({
          target_type: 'athlete', target_id: d.athlete_id, company_id: athlete?.company_id ?? recipient.companyId,
          to_email: to, subject: email.subject, body_html: logged.html,
          sender_kind: 'smtp', sender_email: sender.fromEmail, sent_by: opts.triggeredBy ?? null,
          provider_id: res.messageId, dedupe_key: `a2i-roles:${send.id}:${d.email_lower}`,
        });
        if (logErr) console.warn('[a2i-roles] email_log insert failed', logErr.message);
      } else {
        tally.failed_this_run++;
        await sb.from('a2i_role_alert_deliveries').update({ status: 'failed', error: trimError(res.error) }, COUNT_EXACT).eq('id', d.id);
        if (++consecutive >= MAX_CONSECUTIVE_FAILURES) break;
      }
    }

    // ── Settle the send ──
    const counts = await deliveryCounts(sb, send.id);
    const remaining = counts.pending + counts.sending;
    const sentCount = counts.sent;
    const failedCount = counts.failed;
    tally.recipients = counts.pending + counts.sending + counts.sent + counts.failed;
    tally.remaining = remaining;

    const halted = consecutive >= MAX_CONSECUTIVE_FAILURES;
    if (remaining === 0 || halted) {
      const status: RoleAlertSend['status'] = remaining === 0 ? 'complete' : 'failed';
      const error = halted ? `Stopped after ${MAX_CONSECUTIVE_FAILURES} failed sends in a row. ${remaining} still to send.` : null;
      await sb.from('a2i_role_alert_sends').update({
        status, sent_count: sentCount, failed_count: failedCount, recipient_count: tally.recipients,
        completed_at: remaining === 0 ? new Date().toISOString() : null, error,
      }, COUNT_EXACT).eq('id', send.id);
      tally.status = status;
      if (failedCount > 0) {
        await alertOnce(sb, config, send, deps, 'Some Thursday roles emails did not send',
          `${sentCount} sent, ${failedCount} failed${remaining ? `, ${remaining} not yet sent` : ''}.`);
      }
    } else {
      await sb.from('a2i_role_alert_sends').update({
        status: 'sending', sent_count: sentCount, failed_count: failedCount, recipient_count: tally.recipients,
      }, COUNT_EXACT).eq('id', send.id);
      tally.status = 'sending';
    }

    return { tally, degraded: failedCount > 0 || tally.status === 'failed', error: null };
  } finally {
    session.close();
  }
}

export const DELIVERY_STATUSES = ['pending', 'sending', 'sent', 'failed', 'skipped'] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];

/** Server-side counts per status — never a row read, so no row cap. */
export async function deliveryCounts(sb: SupabaseClient, sendId: string): Promise<Record<DeliveryStatus, number>> {
  const results = await Promise.all(DELIVERY_STATUSES.map(s =>
    sb.from('a2i_role_alert_deliveries').select('id', { count: 'exact', head: true }).eq('send_id', sendId).eq('status', s)));
  return Object.fromEntries(DELIVERY_STATUSES.map((s, i) => [s, results[i].count ?? 0])) as Record<DeliveryStatus, number>;
}

/** Put this week's failed deliveries back in the queue (staff action). */
export async function requeueFailed(sb: SupabaseClient, now: Date): Promise<{ requeued: number; error: string | null }> {
  const weekKey = londonWeekKey(now);
  const { data: send } = await sb.from('a2i_role_alert_sends').select('id, status').eq('week_key', weekKey).maybeSingle();
  if (!send) return { requeued: 0, error: 'Nothing has been sent this week yet.' };
  const { count, error } = await sb.from('a2i_role_alert_deliveries')
    .update({ status: 'pending', error: null }, COUNT_EXACT)
    .eq('send_id', send.id).eq('status', 'failed');
  if (error) return { requeued: 0, error: error.message };
  if (count) {
    await sb.from('a2i_role_alert_sends').update({ status: 'sending', completed_at: null, alerted_at: null }, COUNT_EXACT).eq('id', send.id);
  }
  return { requeued: count ?? 0, error: null };
}
