import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, lastEmailError } from '@/lib/email';
import { notificationEmail } from '@/lib/email/templates/notification';
import { brandFromAddress } from '@/lib/brand';
import { portalUrl } from '@/lib/portalUrl';
import { adminUrl } from '@/lib/adminUrl';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import type { EmailMode, NotificationPreferences, NotificationType } from './types';

// The ONE way anything on the platform tells a person something.
//
// Called by the event consumer (lib/events/process.ts) with the service
// role. It resolves an audience to profiles, writes one `notifications`
// row per recipient (deduped by key, so a re-processed event adds
// nothing), reads each recipient's preference, and for those who want
// email now CLAIMS the row (`emailed_at`, conditional, counted) before
// sending. A failed send releases the claim and is recorded in
// email_log with the error, so the daily digest can carry it and
// /automation can show it. The referral cron sent 518 duplicate emails
// by sending first and recording second; the order here is the fix
// generalised.
//
// Who is "staff": tps_admin ONLY. is_tps_staff() is tps_admin only, and
// notifying tps_client would email demo accounts.

export type Audience =
  | { kind: 'staff' }
  | { kind: 'account_owner'; companyId: string }
  | { kind: 'company_admins'; companyId: string }
  | { kind: 'company_editors'; companyId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'provider_users'; providerId: string };

export interface Recipient {
  id:    string;
  email: string | null;
  role:  string;
  app:   'admin' | 'portal';
}

export interface NotifyInput {
  audiences:  Audience[];
  companyId:  string | null;
  type:       NotificationType;
  title:      string;
  body?:      string | null;
  /** A path per app; each recipient gets the one for the app they sign in to. */
  link?:      { admin?: string; portal?: string };
  /** Stable per consequence: `${rule}:${eventId}:${i}`. The recipient id is appended. */
  dedupeKey:  string;
  /** Emails a `daily`-mode recipient at once instead of in the digest. */
  urgent?:    boolean;
  /** Never email this one, whatever the preference: it is a suggestion
   *  about a named person (an absence pattern) and belongs in the app,
   *  where the context is. The digest skips it too. */
  inAppOnly?: boolean;
  eventId?:   number | null;
  /** Optional richer email body; the default is the generic notification template. */
  emailHtml?: (r: Recipient, absoluteLink: string | null) => { subject: string; html: string; tag?: string };
}

export interface NotifyTally {
  recipients:     number;
  notified:       number;
  emailed:        number;
  email_failures: number;
}

export const STAFF_ROLE = 'tps_admin';
const ADMIN_APP_ROLES = new Set(['tps_admin', 'hs_provider']);

function toRecipient(p: { id: string; email: string | null; role: string }): Recipient {
  return { id: p.id, email: p.email, role: p.role, app: ADMIN_APP_ROLES.has(p.role) ? 'admin' : 'portal' };
}

const PROFILE_COLS = 'id, email, role';

export async function resolveAudience(sb: SupabaseClient, a: Audience): Promise<Recipient[]> {
  switch (a.kind) {
    case 'staff': {
      const { data, error } = await sb.from('profiles').select(PROFILE_COLS).eq('role', STAFF_ROLE);
      if (error) throw new Error(`resolve staff: ${error.message}`);
      return (data ?? []).map(toRecipient);
    }
    case 'account_owner': {
      const { data: co, error } = await sb.from('companies').select('account_owner_id').eq('id', a.companyId).maybeSingle();
      if (error) throw new Error(`resolve account_owner: ${error.message}`);
      const owner = (co as { account_owner_id?: string | null } | null)?.account_owner_id;
      if (!owner) return resolveAudience(sb, { kind: 'staff' });
      const { data: p, error: pErr } = await sb.from('profiles').select(PROFILE_COLS).eq('id', owner).maybeSingle();
      if (pErr) throw new Error(`resolve account_owner profile: ${pErr.message}`);
      // An owner who is no longer staff (moved, deactivated) must not
      // silently swallow the client's request.
      if (!p || (p as { role: string }).role !== STAFF_ROLE) return resolveAudience(sb, { kind: 'staff' });
      return [toRecipient(p as { id: string; email: string | null; role: string })];
    }
    case 'company_admins':
    case 'company_editors': {
      const roles = a.kind === 'company_admins' ? ['client_admin'] : ['client_admin', 'client_editor'];
      const { data, error } = await sb.from('profiles').select(PROFILE_COLS).eq('company_id', a.companyId).in('role', roles);
      if (error) throw new Error(`resolve ${a.kind}: ${error.message}`);
      return (data ?? []).map(toRecipient);
    }
    case 'user': {
      const { data, error } = await sb.from('profiles').select(PROFILE_COLS).eq('id', a.userId).maybeSingle();
      if (error) throw new Error(`resolve user: ${error.message}`);
      return data ? [toRecipient(data as { id: string; email: string | null; role: string })] : [];
    }
    case 'provider_users': {
      const { data, error } = await sb.from('profiles').select(PROFILE_COLS).eq('hs_provider_id', a.providerId).eq('role', 'hs_provider');
      if (error) throw new Error(`resolve provider_users: ${error.message}`);
      return (data ?? []).map(toRecipient);
    }
  }
}

export async function resolveRecipients(sb: SupabaseClient, audiences: Audience[]): Promise<Recipient[]> {
  const seen = new Map<string, Recipient>();
  for (const a of audiences) {
    for (const r of await resolveAudience(sb, a)) if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return [...seen.values()];
}

/** Nobody has set a preference yet: staff get one digest a morning (a
 *  solo operator does not want one email per event), everyone else
 *  hears at once. */
export function defaultEmailMode(role: string): EmailMode {
  return role === STAFF_ROLE ? 'daily' : 'immediate';
}

export function shouldEmailNow(mode: EmailMode, urgent: boolean): boolean {
  if (mode === 'immediate') return true;
  if (mode === 'daily') return urgent;
  return false;
}

export function absoluteLink(r: Recipient, link: NotifyInput['link']): string | null {
  const path = r.app === 'admin' ? link?.admin : link?.portal;
  if (!path) return null;
  return `${r.app === 'admin' ? adminUrl() : portalUrl()}${path}`;
}

export async function readPreferences(sb: SupabaseClient, userIds: string[]): Promise<Map<string, NotificationPreferences>> {
  const out = new Map<string, NotificationPreferences>();
  if (userIds.length === 0) return out;
  const { data, error } = await sb.from('notification_preferences')
    .select('user_id, email_mode, muted_types, weekly_summary').in('user_id', userIds);
  if (error) throw new Error(`read preferences: ${error.message}`);
  for (const p of (data ?? []) as NotificationPreferences[]) out.set(p.user_id, p);
  return out;
}

export async function notify(sb: SupabaseClient, input: NotifyInput): Promise<NotifyTally> {
  const tally: NotifyTally = { recipients: 0, notified: 0, emailed: 0, email_failures: 0 };
  const recipients = await resolveRecipients(sb, input.audiences);
  tally.recipients = recipients.length;
  if (recipients.length === 0) return tally;

  const rows = recipients.map(r => ({
    user_id:    r.id,
    company_id: input.companyId,
    type:       input.type,
    title:      input.title.slice(0, 200),
    body:       input.body ? input.body.slice(0, 1_000) : null,
    link:       (r.app === 'admin' ? input.link?.admin : input.link?.portal) ?? null,
    dedupe_key: `${input.dedupeKey}:${r.id}`,
    event_id:   input.eventId ?? null,
  }));

  // ignoreDuplicates: a row already holding this dedupe key is left
  // alone and NOT returned, so `inserted` is exactly the set created
  // by this call — the only ones that may be emailed.
  const { data: inserted, error } = await sb.from('notifications')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id, user_id');
  if (error) throw new Error(`notifications upsert: ${error.message}`);
  const created = (inserted ?? []) as { id: string; user_id: string }[];
  tally.notified = created.length;
  if (created.length === 0) return tally;
  if (input.inAppOnly) {
    // Claim the rows as "emailed" so the digest never carries them either.
    await sb.from('notifications').update({ emailed_at: new Date().toISOString() }, COUNT_EXACT).in('id', created.map(n => n.id));
    return tally;
  }

  const byId = new Map(recipients.map(r => [r.id, r]));
  const prefs = await readPreferences(sb, created.map(n => n.user_id));

  for (const n of created) {
    const r = byId.get(n.user_id);
    if (!r || !r.email) continue;
    const pref = prefs.get(r.id);
    if (pref?.muted_types?.includes(input.type)) continue;
    const mode = pref?.email_mode ?? defaultEmailMode(r.role);
    if (!shouldEmailNow(mode, input.urgent === true)) continue;

    // Claim before send.
    const claim = await sb.from('notifications').update({ emailed_at: new Date().toISOString() }, COUNT_EXACT)
      .eq('id', n.id).is('emailed_at', null);
    if (!judgeWrite({ error: claim.error, count: claim.count }).ok) continue;

    const href = absoluteLink(r, input.link);
    const message = input.emailHtml
      ? input.emailHtml(r, href)
      : notificationEmail({ title: input.title, body: input.body ?? null, href, type: input.type });
    const result = await sendEmail({ to: r.email, subject: message.subject, html: message.html, tag: message.tag ?? 'notification' });
    const errorMessage = result?.delivered ? null : (lastEmailError()?.message ?? 'Email send failed.');
    if (errorMessage) {
      tally.email_failures++;
      await sb.from('notifications').update({ emailed_at: null }, COUNT_EXACT).eq('id', n.id);
    } else {
      tally.emailed++;
    }
    await logEmail(sb, {
      recipient: r, companyId: input.companyId, subject: message.subject, html: message.html,
      providerId: result?.delivered ? result.id : null, errorMessage,
    });
  }
  return tally;
}

export async function logEmail(sb: SupabaseClient, e: {
  recipient: Recipient; companyId: string | null; subject: string; html: string;
  providerId: string | null; errorMessage: string | null;
}): Promise<void> {
  const { error } = await sb.from('email_log').insert({
    target_type:   'user',
    target_id:     e.recipient.id,
    company_id:    e.companyId,
    profile_id:    e.recipient.id,
    to_email:      e.recipient.email,
    subject:       e.subject,
    body_html:     e.html,
    sender_kind:   'resend',
    sender_email:  brandFromAddress(process.env.EMAIL_FROM),
    sent_by:       null,
    provider_id:   e.providerId,
    error_message: e.errorMessage,
  });
  if (error) console.warn('[notify] email_log insert failed', error.message);
}
