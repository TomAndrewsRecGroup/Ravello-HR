import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';

// The cron shell: secret, kill switch, one automation_runs row per call.
// What the run does is covered in lib/a2iRoles/__tests__/send.test.ts.

let db: ReturnType<typeof fakeSupabase>;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { GET } = await import('../route');
const req = (secret?: string) => new NextRequest(`https://admin.example.com/api/cron/a2i-role-alert${secret ? `?secret=${secret}` : ''}`);

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  delete process.env.AUTOMATION_DISABLED;
  db = fakeSupabase({
    automation_runs: [],
    a2i_role_alert_config: [{ id: 'cfg', singleton: true, enabled: false, recipient_mode: 'all', sender_profile_id: null,
      role_url_template: 'https://www.andrews-recruitment.com/jobs/{id}', notify_email: 'tom@andrews-recruitment.com', updated_by: null }],
  });
});

describe('GET /api/cron/a2i-role-alert', () => {
  it('refuses without the secret', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('records an ok run that skips while the feature is switched off', async () => {
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tally.skipped).toBe('disabled');
    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'a2i-role-alert', outcome: 'ok' });
    expect(db.tables.a2i_role_alert_sends ?? []).toHaveLength(0);
  });

  it('AUTOMATION_DISABLED=1 records a disabled run and sends nothing', async () => {
    process.env.AUTOMATION_DISABLED = '1';
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'a2i-role-alert', outcome: 'disabled' });
  });
});
