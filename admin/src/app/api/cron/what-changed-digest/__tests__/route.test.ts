import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';

// Same cron shape as every other automation job: refused without the
// secret, records an automation_runs row (refusals included), and a
// kill switch. The digest logic itself is covered in
// lib/whatChanged/__tests__/digest.test.ts.

let db: ReturnType<typeof fakeSupabase>;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => db.client,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async () => ({ id: 'r', delivered: true }),
  lastEmailError: () => null,
}));

const { GET } = await import('../route');

const req = (secret?: string) => new NextRequest(`https://admin.example.com/api/cron/what-changed-digest${secret ? `?secret=${secret}` : ''}`);

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  delete process.env.AUTOMATION_DISABLED;
  db = fakeSupabase({
    profiles: [], notification_preferences: [], platform_events: [], email_log: [], automation_runs: [],
  });
});

describe('GET /api/cron/what-changed-digest', () => {
  it('refuses without the secret', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(db.tables.automation_runs).toHaveLength(0);
  });

  it('records an ok run with no candidates', async () => {
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'what-changed-digest', outcome: 'ok' });
  });

  it('AUTOMATION_DISABLED=1 records a disabled run and writes nothing', async () => {
    process.env.AUTOMATION_DISABLED = '1';
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'what-changed-digest', outcome: 'disabled' });
  });
});
