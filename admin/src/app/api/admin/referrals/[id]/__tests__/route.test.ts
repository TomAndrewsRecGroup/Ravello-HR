// referral_role_config has NO foreign key to referral_applications —
// both independently reference requisitions, which is not the same
// thing. The route used to embed
// `config:referral_role_config!inner(...)` inside the
// referral_applications select, which PostgREST cannot resolve without
// a direct FK between the two named tables. That failed on EVERY call
// (PGRST200, "no relationship … in the schema cache"), so `readErr` was
// always truthy and Approve/Reject reported "Referral application not
// found" for every row, whether or not it existed.
//
// This drives the real PATCH handler against a fake Supabase client
// that reproduces that exact failure if the embed regresses, and
// otherwise asserts the two queries the fix requires: config fetched
// as its OWN call, keyed on requisition_id.

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL   ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY  ??= 'stub-service-key';

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

vi.mock('@/lib/rateLimit', () => ({
  limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse:   () => new Response('rate limited', { status: 429 }),
}));

const sendCalls: any[] = [];
let sendResult = { sent: true, providerId: 'resend-1', error: null as string | null };
vi.mock('@/lib/referral/pipeline', () => ({
  sendReferralInvite: (args: any) => { sendCalls.push(args); return Promise.resolve(sendResult); },
}));

/* ── Fake PostgREST ──────────────────────────────────────────
 *
 * Table-scoped: `referral_applications` embeds candidate + requisition
 * (both real FKs, so those resolve); `referral_role_config` is its own
 * top-level call. If the select string handed to `referral_applications`
 * ever names `referral_role_config` again, this reproduces the actual
 * PGRST200 the live database returns, not a generic "broken" stand-in. */

const APP_ID  = 'app-1';
const REQ_ID  = 'req-1';
const CAND_ID = 'cand-1';

let appRow: Record<string, any> | null = {
  id: APP_ID, status: 'qualified', candidate_id: CAND_ID, company_id: 'co-1',
  requisition_id: REQ_ID, manatal_candidate_id: 'mc-1', status_history: [],
  candidate:   { id: CAND_ID, full_name: 'Sample Candidate', email: 'sample@example.com' },
  requisition: { id: REQ_ID, title: 'AI Engineer' },
};
let configRow: Record<string, any> | null = {
  requisition_id: REQ_ID, enabled: true, dry_run: false, partner_name: 'Micro1',
  referral_url: 'https://apply.example.com', email_process_note: null,
  auto_send_threshold: 80, review_threshold: 68, blocked_countries: [], mandatory_criteria: [],
};

const fromCalls: { table: string; select: string }[] = [];
const updates: { table: string; patch: Record<string, any> }[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (sel: string) => {
        fromCalls.push({ table, select: sel });

        if (table === 'referral_applications') {
          if (sel.includes('referral_role_config')) {
            // The real PostgREST error for an embed with no FK path.
            return { eq: () => ({ single: () => Promise.resolve({
              data: null,
              error: { message: "Could not find a relationship between 'referral_applications' and 'referral_role_config' in the schema cache", code: 'PGRST200' },
            }) }) };
          }
          return { eq: () => ({ single: () => Promise.resolve({ data: appRow, error: appRow ? null : { message: 'not found' } }) }) };
        }

        if (table === 'referral_role_config') {
          return { eq: () => ({ single: () => Promise.resolve({ data: configRow, error: configRow ? null : { message: 'not found' } }) }) };
        }

        throw new Error(`unexpected table in test: ${table}`);
      },
      update: (patch: Record<string, any>) => {
        updates.push({ table, patch });
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    }),
  }),
}));

import { PATCH } from '../route';

function patchReq(body: unknown) {
  return new Request('https://admin.thepeoplesystem.co.uk/api/admin/referrals/app-1', {
    method: 'PATCH', body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  fromCalls.length = 0;
  updates.length = 0;
  sendCalls.length = 0;
  appRow = {
    id: APP_ID, status: 'qualified', candidate_id: CAND_ID, company_id: 'co-1',
    requisition_id: REQ_ID, manatal_candidate_id: 'mc-1', status_history: [],
    candidate:   { id: CAND_ID, full_name: 'Sample Candidate', email: 'sample@example.com' },
    requisition: { id: REQ_ID, title: 'AI Engineer' },
  };
  configRow = {
    requisition_id: REQ_ID, enabled: true, dry_run: false, partner_name: 'Micro1',
    referral_url: 'https://apply.example.com', email_process_note: null,
    auto_send_threshold: 80, review_threshold: 68, blocked_countries: [], mandatory_criteria: [],
  };
  sendResult = { sent: true, providerId: 'resend-1', error: null };
});

describe('config is fetched as its own query, never embedded on referral_applications', () => {
  it('approve reads referral_role_config directly, keyed on requisition_id', async () => {
    const res = await PATCH(patchReq({ action: 'approve' }), { params: { id: APP_ID } });
    expect(res.status).toBe(200);

    const appCall = fromCalls.find(c => c.table === 'referral_applications');
    expect(appCall?.select).not.toContain('referral_role_config');

    const configCall = fromCalls.find(c => c.table === 'referral_role_config');
    expect(configCall).toBeTruthy();
  });

  it('approve succeeds end to end and sends through sendReferralInvite', async () => {
    const res = await PATCH(patchReq({ action: 'approve' }), { params: { id: APP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('email_sent');
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].toEmail).toBe('sample@example.com');
    expect(sendCalls[0].config.referral_url).toBe('https://apply.example.com');

    const update = updates.find(u => u.table === 'referral_applications');
    expect(update?.patch.status).toBe('email_sent');
  });

  it('reject does not need the config at all, but still resolves the application', async () => {
    const res = await PATCH(patchReq({ action: 'reject' }), { params: { id: APP_ID } });
    expect(res.status).toBe(200);
    const update = updates.find(u => u.table === 'referral_applications');
    expect(update?.patch.status).toBe('review_rejected');
  });
});

describe('a real application with no saved config is reported distinctly', () => {
  it('404s with a config-specific message, not "application not found"', async () => {
    configRow = null;
    const res = await PATCH(patchReq({ action: 'approve' }), { params: { id: APP_ID } });
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).not.toMatch(/application not found/i);
  });
});
