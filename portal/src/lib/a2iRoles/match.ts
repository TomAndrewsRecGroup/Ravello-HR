// "Match me" from the Athletes To Industry Thursday role email.
//
// The email's button opens a page; the page's button POSTs. A GET never
// records anything, because Outlook Safe Links, Mimecast and Gmail's
// scanners open every link in an email before a human does, and a
// one-click GET would tell Tom that every athlete wanted every role.
//
// One request per athlete per role (UNIQUE in 217): a second press
// returns "already" and sends Tom nothing.

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminUrl } from '@/lib/adminUrl';
import { buildRoleMatchEmail, lastEmailError, sendEmail } from '@/lib/email';
import {
  firstName, loadRoleAlertConfig, peekRoleAlertToken, publicRole, roleFromSend, roleUrl,
  type PublicRole, type RoleAlertConfigLite, type RoleAlertToken, type StoredRole,
} from './token';

interface AthleteRow {
  id: string; full_name: string; email: string | null; phone: string | null; sport: string | null;
  previous_role: string | null; linkedin_url: string | null; bio: string | null; company_id: string | null;
  cv_url: string | null; cv_storage_path: string | null; cv_text: string | null;
}

export type MatchContext =
  | {
      ok: true;
      token: RoleAlertToken;
      role: StoredRole;
      athlete: AthleteRow;
      config: RoleAlertConfigLite;
      alreadyMatched: boolean;
    }
  | { ok: false; status: 404 | 410; error: string };

export async function loadMatchContext(sb: SupabaseClient, rawToken: string, jobId: string): Promise<MatchContext> {
  const token = await peekRoleAlertToken(sb, rawToken);
  if (!token) return { ok: false, status: 404, error: 'This link is not valid.' };
  if (token.expired) {
    return { ok: false, status: 410, error: 'This link has expired. Look out for this week’s roles email, or reply to Tom directly.' };
  }
  const [role, config, { data: athlete }, { data: existing }] = await Promise.all([
    roleFromSend(sb, token.sendId, jobId),
    loadRoleAlertConfig(sb),
    sb.from('athletes')
      .select('id, full_name, email, phone, sport, previous_role, linkedin_url, bio, company_id, cv_url, cv_storage_path, cv_text')
      .eq('id', token.athleteId).maybeSingle(),
    sb.from('a2i_role_interests').select('id').eq('athlete_id', token.athleteId).eq('manatal_job_id', jobId).maybeSingle(),
  ]);
  if (!role || !config || !athlete) return { ok: false, status: 404, error: 'This role is not in your email, or the link is not valid.' };
  return { ok: true, token, role, athlete: athlete as AthleteRow, config, alreadyMatched: Boolean(existing) };
}

/** What the page and the GET may show the athlete. No client name. */
export function publicMatchView(ctx: Extract<MatchContext, { ok: true }>): {
  firstName: string | null; role: PublicRole; roleUrl: string; alreadyMatched: boolean;
} {
  return {
    firstName:      firstName(ctx.athlete.full_name),
    role:           publicRole(ctx.role),
    roleUrl:        roleUrl(ctx.config.role_url_template, ctx.role.id),
    alreadyMatched: ctx.alreadyMatched,
  };
}

export async function submitMatch(
  sb: SupabaseClient,
  ctx: Extract<MatchContext, { ok: true }>,
  note: string | null,
): Promise<{ ok: true; already: boolean; notified: boolean } | { ok: false; error: string }> {
  const { data: inserted, error } = await sb.from('a2i_role_interests').insert({
    athlete_id:     ctx.athlete.id,
    send_id:        ctx.token.sendId,
    manatal_job_id: ctx.role.id,
    position_name:  ctx.role.title.slice(0, 300),
    note:           note ? note.slice(0, 1000) : null,
  }).select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return { ok: true, already: true, notified: false };
    return { ok: false, error: 'We could not record that just now. Please try again.' };
  }
  const interestId = (inserted as { id: string }).id;

  const { data: company } = ctx.athlete.company_id
    ? await sb.from('companies').select('name').eq('id', ctx.athlete.company_id).maybeSingle()
    : { data: null };

  const email = buildRoleMatchEmail({
    to: ctx.config.notify_email,
    athlete: {
      fullName:     ctx.athlete.full_name,
      email:        ctx.athlete.email,
      phone:        ctx.athlete.phone,
      sport:        ctx.athlete.sport,
      previousRole: ctx.athlete.previous_role,
      linkedinUrl:  ctx.athlete.linkedin_url,
      bio:          ctx.athlete.bio,
      referredBy:   (company as { name: string } | null)?.name ?? null,
      hasCv:        Boolean(ctx.athlete.cv_storage_path || ctx.athlete.cv_url || ctx.athlete.cv_text),
    },
    role: {
      id:         ctx.role.id,
      title:      ctx.role.title,
      location:   ctx.role.location,
      contract:   ctx.role.contract,
      salary:     ctx.role.salary,
      clientName: ctx.role.clientName ?? null,
      url:        roleUrl(ctx.config.role_url_template, ctx.role.id),
    },
    note,
    adminLink: `${adminUrl()}/athletes-to-industry/roles-email`,
  });
  const sent = await sendEmail({ ...email, replyTo: ctx.athlete.email ?? undefined });
  const notifyError = sent ? null : (lastEmailError()?.message ?? 'Email send failed');
  await sb.from('a2i_role_interests')
    .update(sent ? { notified_at: new Date().toISOString() } : { notify_error: notifyError!.slice(0, 1900) }, { count: 'exact' })
    .eq('id', interestId);

  // The athlete's request is recorded either way and shows on the admin
  // page, so a failed notification is not the athlete's problem.
  return { ok: true, already: false, notified: Boolean(sent) };
}

/** Stop the weekly role emails for this address. Idempotent; works on
 *  an expired link. */
export async function unsubscribe(sb: SupabaseClient, rawToken: string): Promise<{ ok: true; already: boolean } | { ok: false; status: 404; error: string }> {
  const token = await peekRoleAlertToken(sb, rawToken);
  if (!token) return { ok: false, status: 404, error: 'This link is not valid.' };
  if (await isUnsubscribed(sb, token.emailLower)) return { ok: true, already: true };
  const { error } = await sb.from('a2i_role_alert_optouts')
    .upsert({ email_lower: token.emailLower, athlete_id: token.athleteId, source: 'link' },
      { onConflict: 'email_lower', ignoreDuplicates: true });
  if (error) return { ok: false, status: 404, error: 'We could not update your preferences just now. Please try again.' };
  return { ok: true, already: false };
}

export async function isUnsubscribed(sb: SupabaseClient, emailLower: string): Promise<boolean> {
  const { data } = await sb.from('a2i_role_alert_optouts').select('id').eq('email_lower', emailLower).maybeSingle();
  return Boolean(data);
}
