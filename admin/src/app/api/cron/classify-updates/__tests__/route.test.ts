import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';

// Same cron shape as every other automation job: refused without the
// secret, records an automation_runs row (refusals included), and a
// kill switch. The actual classification logic is covered in
// lib/latestUpdates/__tests__/classify.test.ts.

let db: ReturnType<typeof fakeSupabase>;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => db.client,
}));
vi.mock('@/lib/jev/transport', async () => {
  const real = await vi.importActual<typeof import('@/lib/jev/transport')>('@/lib/jev/transport');
  return { ...real, sendToJev: async () => ({ status: 200, payload: null, error: 'no key configured in this test', durationMs: 1 }) };
});

const { GET } = await import('../route');

const req = (secret?: string) => new NextRequest(`https://admin.example.com/api/cron/classify-updates${secret ? `?secret=${secret}` : ''}`);

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  delete process.env.AUTOMATION_DISABLED;
  delete process.env.JEV_API_KEY;
  db = fakeSupabase({
    latest_updates: [{ id: 'u1', title: 'Some news', description: null, status: 'published', regulatory_classified_at: null }],
    compliance_items: [], profiles: [], notifications: [], notification_preferences: [], email_log: [], jev_decisions: [], automation_runs: [],
  });
});

describe('GET /api/cron/classify-updates', () => {
  it('refuses without the secret and classifies nothing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(db.tables.latest_updates[0].regulatory_classified_at).toBeNull();
  });

  it('records an ok run (Jev disabled here: the row is recorded as \'none\', not skipped)', async () => {
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(db.tables.latest_updates[0].regulatory_category).toBe('none');
    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'classify-updates', outcome: 'ok' });
  });

  it('AUTOMATION_DISABLED=1 records a disabled run and writes nothing', async () => {
    process.env.AUTOMATION_DISABLED = '1';
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(db.tables.latest_updates[0].regulatory_classified_at).toBeNull();
    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'classify-updates', outcome: 'disabled' });
  });
});
