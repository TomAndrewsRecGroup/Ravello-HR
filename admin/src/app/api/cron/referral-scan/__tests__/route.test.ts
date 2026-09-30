import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';

// Phase 20 (Core-OS 360 Completion Programme) baseline preservation test.
//
// This is the actual hourly cron entry point (admin/vercel.json,
// "0 * * * *") — until this file, it had ZERO automated coverage of any
// kind. The pipeline's own gating/scoring/idempotency logic is covered
// separately (pipeline.test.ts / pipelineIdempotency.test.ts /
// approve.test.ts), all against processRole/processMatch directly. This
// file is the thin wrapper around them: CRON_SECRET auth, and that
// every invocation — refused, empty, or real — leaves exactly one
// referral_scan_runs row, in the route's own vocabulary
// (ok/degraded/no_roles/error/unauthorized), per the "Every skip reason
// is counted" rule this codebase already holds itself to.
//
// The "no enabled roles" path exercises the REAL runReferralScan()
// unmocked — it is the one path through the real pipeline that needs no
// Manatal/IvyLens/email mocking at all (no roles means no applicants to
// fetch), so this is a genuine, not a stubbed, pass through the cron's
// actual code.

let db: ReturnType<typeof fakeSupabase>;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => db.client,
}));

const { GET } = await import('../route');

const req = (opts: { secret?: string; cap?: string } = {}) => {
  const url = new URL('https://admin.example.com/api/cron/referral-scan');
  if (opts.secret) url.searchParams.set('secret', opts.secret);
  if (opts.cap) url.searchParams.set('cap', opts.cap);
  return new NextRequest(url);
};

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  db = fakeSupabase({ referral_role_config: [], referral_scan_runs: [] });
});

describe('GET /api/cron/referral-scan', () => {
  it('refuses without the secret, and records an unauthorized run only when CRON_SECRET itself is unset', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(db.tables.referral_scan_runs).toHaveLength(1);
    expect(db.tables.referral_scan_runs[0]).toMatchObject({ ok: false, outcome: 'unauthorized' });
  });

  it('refuses a wrong secret and records NOTHING — a caller guessing secrets must not fill the table', async () => {
    const res = await GET(req({ secret: 'wrong' }));
    expect(res.status).toBe(401);
    expect(db.tables.referral_scan_runs).toHaveLength(0);
  });

  it('accepts the header form of the secret too', async () => {
    const res = await GET(new NextRequest('https://admin.example.com/api/cron/referral-scan', {
      headers: { authorization: 'Bearer s3cret' },
    }));
    expect(res.status).toBe(200);
  });

  it('with no enabled referral_role_config rows, runs the REAL pipeline end to end and records outcome no_roles', async () => {
    const res = await GET(req({ secret: 's3cret' }));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.roles_considered).toBe(0);
    expect(db.tables.referral_scan_runs).toHaveLength(1);
    expect(db.tables.referral_scan_runs[0]).toMatchObject({ ok: true, outcome: 'no_roles' });
  });

  it('a disabled role (enabled: false) is excluded from the scan, same as no roles at all', async () => {
    db.tables.referral_role_config.push({
      requisition_id: 'req-1', enabled: false, dry_run: true, partner_name: 'Micro1',
      referral_url: 'https://x', email_process_note: null, auto_send_threshold: 85, review_threshold: 75,
      blocked_countries: [], mandatory_criteria: [],
      requisition: { id: 'req-1', title: 'Role', company_id: 'c1', manatal_job_id: 'j1', ivylens_role_id: 'r1', jd_text: null, description: null },
    });
    const res = await GET(req({ secret: 's3cret' }));
    const payload = await res.json();
    expect(payload.roles_considered).toBe(0);
    expect(db.tables.referral_scan_runs[0].outcome).toBe('no_roles');
  });
});
