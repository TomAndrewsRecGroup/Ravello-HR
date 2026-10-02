import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken, normaliseAccessToken } from './accessTokens';

// Shareable report links (go-live gap list, item 7). A report
// (`reports`, the generic table both apps already read/write for
// uploaded documents and the monthly/quarterly Value Report) has
// always needed an authenticated session to view — no way to hand one
// to an external party (an insurer, an auditor, a regulator) without
// giving them a portal/admin login.
//
// Exactly the `policy_ack_tokens`/`hs_test_tokens`/`worker_qr_tokens`
// shape: the raw token exists only in the link the creator copies/
// emails; the database holds its SHA-256 in `report_share_tokens`
// (migration 207), RLS on, NO POLICIES — service role only, the same
// "fails closed by design" posture those three tables already use.
// Unlike a single-use set-password token, a share link is DURABLE
// (`worker_qr_tokens`' own model): the recipient may open it more than
// once before it expires or is revoked.
//
// Shared by both apps (scripts/check-shared-dupes.sh): each app mints
// and lists its own links (whoever can see the report); the portal's
// public `/report/[token]` route peeks, signs the file and bumps
// access stats.

export const REPORT_SHARE_TOKEN_MAX_TTL_DAYS = 90;
export const REPORT_SHARE_TOKEN_DEFAULT_TTL_DAYS = 30;

export interface ReportShareTokenSummary {
  /** First 12 hex chars of the token's SHA-256 (48 bits) — enough to
   *  tell two links apart in a UI "revoke this one" action, nowhere
   *  near enough to help anyone recover the original random token
   *  (that would mean inverting SHA-256, not guessing from a prefix). */
  tokenHashPrefix: string;
  createdByName:  string;
  recipientNote:  string | null;
  expiresAt:      string;
  revokedAt:      string | null;
  lastAccessedAt: string | null;
  accessCount:    number;
  createdAt:      string;
}

/** Mint a link for a report. The caller has ALREADY verified (its own
 *  session/RLS) that it may see this report — this function trusts
 *  reportId/companyId as given, the same way `mintPolicyAckToken`
 *  trusts the acknowledgement id its own caller already resolved. */
export async function mintReportShareToken(
  service: SupabaseClient,
  params: {
    reportId:       string;
    companyId:      string;
    createdBy:      string | null;
    createdByName:  string;
    recipientNote?: string | null;
    ttlDays?:       number;
  },
  now: number = Date.now(),
): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const ttlDays = Math.min(Math.max(params.ttlDays ?? REPORT_SHARE_TOKEN_DEFAULT_TTL_DAYS, 1), REPORT_SHARE_TOKEN_MAX_TTL_DAYS);
  const token = crypto.randomUUID();
  const tokenHash = await hashAccessToken(token);
  const expiresAt = new Date(now + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await service.from('report_share_tokens').insert({
    token_hash: tokenHash,
    report_id: params.reportId,
    company_id: params.companyId,
    created_by: params.createdBy,
    created_by_name: params.createdByName,
    recipient_note: params.recipientNote?.slice(0, 200) || null,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { token, expiresAt };
}

/** Look a link up without recording an access — used by the public
 *  route to decide what to render before it signs anything. */
export async function peekReportShareToken(
  service: SupabaseClient,
  raw: string | null | undefined,
  now: number = Date.now(),
): Promise<{ tokenHash: string; reportId: string; companyId: string; recipientNote: string | null } | 'expired' | 'revoked' | null> {
  const token = normaliseAccessToken(raw);
  if (!token) return null;
  const tokenHash = await hashAccessToken(token);
  const { data } = await service
    .from('report_share_tokens')
    .select('report_id, company_id, recipient_note, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  const row = data as { report_id: string; company_id: string; recipient_note: string | null; expires_at: string; revoked_at: string | null } | null;
  if (!row) return null;
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at).getTime() <= now) return 'expired';
  return { tokenHash, reportId: row.report_id, companyId: row.company_id, recipientNote: row.recipient_note };
}

/** Best-effort access-stat bump — never blocks the response on failure.
 *  { count: 'exact' } is read but deliberately ignored: a miss here
 *  (the link was revoked a moment ago) is not an error worth surfacing
 *  to a recipient already past the real gate (peekReportShareToken). */
export async function touchReportShareToken(service: SupabaseClient, tokenHash: string, now: number = Date.now()): Promise<void> {
  const { data } = await service.from('report_share_tokens').select('access_count').eq('token_hash', tokenHash).maybeSingle();
  const current = (data as { access_count: number } | null)?.access_count ?? 0;
  await service.from('report_share_tokens')
    .update({ access_count: current + 1, last_accessed_at: new Date(now).toISOString() }, { count: 'exact' })
    .eq('token_hash', tokenHash);
}

/** Revoke one link by its hash PREFIX (what the UI can see — see
 *  `ReportShareTokenSummary.tokenHashPrefix`), scoped to the report and
 *  company that created it. The calling route has already checked the
 *  session may manage this report's own company, so this is a narrow
 *  safety net, not the real gate. Returns true only if exactly one
 *  live (not already revoked) row matched the prefix. */
export async function revokeReportShareToken(service: SupabaseClient, tokenHashPrefix: string, reportId: string, companyId: string): Promise<boolean> {
  const { data } = await service.from('report_share_tokens')
    .select('token_hash')
    .eq('report_id', reportId).eq('company_id', companyId).is('revoked_at', null)
    .like('token_hash', `${tokenHashPrefix}%`)
    .limit(2); // only ever need to tell "exactly one" from "more than one"
  const rows = (data ?? []) as { token_hash: string }[];
  if (rows.length !== 1) return false;
  const { count } = await service.from('report_share_tokens')
    .update({ revoked_at: new Date().toISOString() }, { count: 'exact' })
    .eq('token_hash', rows[0].token_hash).is('revoked_at', null);
  return (count ?? 0) > 0;
}

/** Every link for a report, newest first — never the raw token or its
 *  full hash, only what a creator needs to see "who has a link, and is
 *  it still live" plus a short, non-reversible prefix to revoke by. */
export async function listReportShareTokens(service: SupabaseClient, reportId: string): Promise<ReportShareTokenSummary[]> {
  const { data } = await service.from('report_share_tokens')
    .select('token_hash, created_by_name, recipient_note, expires_at, revoked_at, last_accessed_at, access_count, created_at')
    .eq('report_id', reportId).order('created_at', { ascending: false }).limit(50);
  return (data ?? []).map((r: any) => ({
    tokenHashPrefix: r.token_hash.slice(0, 12),
    createdByName: r.created_by_name, recipientNote: r.recipient_note, expiresAt: r.expires_at,
    revokedAt: r.revoked_at, lastAccessedAt: r.last_accessed_at, accessCount: r.access_count, createdAt: r.created_at,
  }));
}
