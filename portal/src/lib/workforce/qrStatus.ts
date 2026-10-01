import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken, normaliseAccessToken } from '@/lib/auth/accessTokens';

// The one place a worker QR badge token is resolved to a person — used
// by the public GET status route and both check-in/out routes, so all
// three can never disagree about what a token means. Every caller uses
// the SERVICE ROLE client: worker_qr_tokens is RLS-on-no-policies
// (179), and an anonymous scan has no session for RLS to evaluate
// anyway.
export interface WorkerQrStatus {
  ok: true;
  personId: string;
  companyId: string;
  siteId: string | null;
  fullName: string;
  jobTitle: string | null;
  companyName: string | null;
  siteName: string | null;
  status: string;
  checkedIn: boolean;
}

export async function loadWorkerQrStatus(
  service: SupabaseClient,
  rawToken: string | null | undefined,
): Promise<WorkerQrStatus | { ok: false }> {
  const token = normaliseAccessToken(rawToken);
  if (!token) return { ok: false };
  const tokenHash = await hashAccessToken(token);

  const { data: tokenRow } = await service.from('worker_qr_tokens')
    .select('person_id, revoked_at').eq('token_hash', tokenHash).maybeSingle();
  if (!tokenRow || tokenRow.revoked_at) return { ok: false };

  const { data: statusResult } = await service.rpc('worker_qr_status', { p_token_hash: tokenHash });
  if (!statusResult?.ok) return { ok: false };

  const { data: person } = await service.from('people').select('site_id, company_id').eq('id', tokenRow.person_id).maybeSingle();
  const { data: openCheckin } = await service.from('site_checkins')
    .select('id').eq('person_id', tokenRow.person_id).is('checked_out_at', null).maybeSingle();

  return {
    ok: true,
    personId: tokenRow.person_id,
    companyId: (person?.company_id as string | undefined) ?? '',
    siteId: (person?.site_id as string | null) ?? null,
    fullName: statusResult.full_name as string,
    jobTitle: (statusResult.job_title as string | null) ?? null,
    companyName: (statusResult.company_name as string | null) ?? null,
    siteName: (statusResult.site_name as string | null) ?? null,
    status: statusResult.status as string,
    checkedIn: openCheckin != null,
  };
}
