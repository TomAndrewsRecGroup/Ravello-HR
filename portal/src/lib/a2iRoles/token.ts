// The no-login links in the Athletes To Industry Thursday role email
// (admin/src/lib/a2iRoles/send.ts mints them; migration 217).
//
// The token is a random UUID whose SHA-256 is in a2i_role_alert_tokens
// (service role only). Possession of the link IS the authorisation, the
// policy_ack_tokens (103) model. One token covers every role in that
// week's email (Match me) and the unsubscribe link.
//
// Match me needs a live token (30 days). Unsubscribe works on an
// expired one too: someone asking to stop must always be able to.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken, normaliseAccessToken } from '@/lib/auth/accessTokens';

export interface RoleAlertToken {
  tokenHash:  string;
  deliveryId: string;
  sendId:     string;
  athleteId:  string;
  emailLower: string;
  expired:    boolean;
}

/** The role as stored in the send's snapshot. `clientName` is internal
 *  and must never reach the athlete — use `publicRole()`. */
export interface StoredRole {
  id:          string;
  title:       string;
  location:    string | null;
  contract:    string | null;
  salary:      string | null;
  industry:    string | null;
  summary:     string;
  clientName?: string | null;
}

export interface PublicRole {
  id: string; title: string; location: string | null; contract: string | null;
  salary: string | null; industry: string | null; summary: string;
}

export function publicRole(r: StoredRole): PublicRole {
  return {
    id: r.id, title: r.title, location: r.location ?? null, contract: r.contract ?? null,
    salary: r.salary ?? null, industry: r.industry ?? null, summary: r.summary ?? '',
  };
}

export async function peekRoleAlertToken(sb: SupabaseClient, raw: string, now = new Date()): Promise<RoleAlertToken | null> {
  const token = normaliseAccessToken(raw);
  if (!token) return null;
  const tokenHash = await hashAccessToken(token);
  const { data } = await sb.from('a2i_role_alert_tokens')
    .select('token_hash, delivery_id, send_id, athlete_id, email_lower, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  const row = data as { token_hash: string; delivery_id: string; send_id: string; athlete_id: string; email_lower: string; expires_at: string } | null;
  if (!row) return null;
  return {
    tokenHash:  row.token_hash,
    deliveryId: row.delivery_id,
    sendId:     row.send_id,
    athleteId:  row.athlete_id,
    emailLower: row.email_lower,
    expired:    Date.parse(row.expires_at) <= now.getTime(),
  };
}

/** The role with this Manatal id, but only if it was in THIS email. */
export async function roleFromSend(sb: SupabaseClient, sendId: string, jobId: string): Promise<StoredRole | null> {
  if (!/^[0-9]{1,20}$/.test(jobId)) return null;
  const { data } = await sb.from('a2i_role_alert_sends').select('jobs').eq('id', sendId).maybeSingle();
  const jobs = (data as { jobs: StoredRole[] | null } | null)?.jobs ?? [];
  return Array.isArray(jobs) ? (jobs.find(j => String(j.id) === jobId) ?? null) : null;
}

export interface RoleAlertConfigLite { role_url_template: string; notify_email: string }

export async function loadRoleAlertConfig(sb: SupabaseClient): Promise<RoleAlertConfigLite | null> {
  const { data } = await sb.from('a2i_role_alert_config')
    .select('role_url_template, notify_email').eq('singleton', true).maybeSingle();
  return (data as RoleAlertConfigLite | null) ?? null;
}

export function roleUrl(template: string, jobId: string): string {
  return template.split('{id}').join(encodeURIComponent(jobId));
}

export function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first || null;
}
