import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The cron shape: refused without the secret, switched off by
// AUTOMATION_DISABLED with a run row saying so, and a run row on
// success carrying the tally.

const runs: any[] = [];
let processed = 0;
vi.mock('@/lib/events/process', () => ({
  processEvents: async () => { processed++; return { claimed: 2, processed: 2, failed: 0, consequences: 3, notified: 3, emailed: 1, email_failures: 0, errors: [] }; },
}));
// The SLA sweep runs first in the same job; its own behaviour is
// slaSweep.test.ts's business.
let swept = 0;
vi.mock('@/lib/support/slaSweep', () => ({
  sweepSlaBreaches: async () => { swept++; return { open_breached: 1, emitted: 1, error: null }; },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => ({ insert: async (row: any) => { if (t === 'automation_runs') runs.push(row); return { error: null }; } }) }),
}));

const { GET } = await import('../route');

const req = (secret?: string) => new NextRequest(`https://admin.example.com/api/cron/process-events${secret ? `?secret=${secret}` : ''}`);

beforeEach(() => {
  runs.length = 0; processed = 0; swept = 0;
  process.env.CRON_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  delete process.env.AUTOMATION_DISABLED;
});
afterEach(() => { delete process.env.AUTOMATION_DISABLED; });

describe('GET /api/cron/process-events', () => {
  it('refuses without the secret and processes nothing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(processed).toBe(0);
    expect(runs).toHaveLength(0);   // secret IS set, so silence is right: an attacker probing gets no row
  });

  it('records an unauthorized run when CRON_SECRET is unset, so the outage is visible', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('anything'));
    expect(res.status).toBe(401);
    expect(runs[0]).toMatchObject({ job: 'process-events', outcome: 'unauthorized' });
  });

  it('AUTOMATION_DISABLED=1 records a disabled run and processes nothing', async () => {
    process.env.AUTOMATION_DISABLED = '1';
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(processed).toBe(0);
    expect(swept).toBe(0);
    expect(runs[0]).toMatchObject({ job: 'process-events', outcome: 'disabled' });
  });

  it('a run writes its tally', async () => {
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(processed).toBe(1);
    expect(swept).toBe(1);
    expect(runs[0]).toMatchObject({ job: 'process-events', outcome: 'ok', tally: { processed: 2, notified: 3, sla: { emitted: 1 } } });
    expect(await res.json()).toMatchObject({ outcome: 'ok', tally: { claimed: 2 } });
  });
});
