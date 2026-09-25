import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';

// The cron shape: refused without the secret; one PDF/report/email
// per active company with a contact_email, skipping companies without
// one; a second run the same month does not re-email (sendKeyedEmail's
// own claim, tested elsewhere, is trusted here — this test only checks
// the cron reaches it with a stable per-month dedupe key).

let db: ReturnType<typeof fakeSupabase>;
let sentEmails: any[] = [];
let uploaded: { path: string; contentType: string }[] = [];

vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));
vi.mock('jspdf', () => ({
  default: class FakeJsPdf {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    lastAutoTable = { finalY: 100 };
    setFillColor() {} setFont() {} setFontSize() {} setTextColor() {}
    rect() {} roundedRect() {} text() {} setPage() {}
    getNumberOfPages() { return 1; }
    output() { return new ArrayBuffer(8); }
  },
}));
vi.mock('jspdf-autotable', () => ({ default: () => {} }));
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return { ...actual, sendEmail: async (input: any) => { sentEmails.push(input); return { delivered: true, id: 'msg-1' }; }, lastEmailError: () => null };
});

const { GET } = await import('../route');

const req = (secret?: string) => new NextRequest(`https://admin.example.com/api/cron/monthly-value-reports${secret ? `?secret=${secret}` : ''}`);

beforeEach(() => {
  sentEmails = [];
  uploaded = [];
  process.env.CRON_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.RESEND_API_KEY = 'test-key';
  delete process.env.AUTOMATION_DISABLED;
  db = fakeSupabase({
    companies: [
      { id: 'co-1', name: 'Acme Ltd', active: true, contact_email: 'ops@acme.example' },
      { id: 'co-2', name: 'No Email Co', active: true, contact_email: null },
    ],
    requisitions: [], candidates: [], tickets: [], documents: [], compliance_items: [],
    service_requests: [], actions: [], profiles: [], client_services: [],
    training_needs: [], performance_reviews: [], absence_records: [], onboarding_instances: [],
    reports: [], email_log: [], automation_runs: [],
  });
  db.client.storage = {
    from: () => ({
      upload: async (path: string, _body: unknown, opts: { contentType: string }) => {
        uploaded.push({ path, contentType: opts.contentType });
        return { data: { path }, error: null };
      },
    }),
  };
});

describe('GET /api/cron/monthly-value-reports', () => {
  it('refuses without the secret and does nothing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(uploaded).toHaveLength(0);
  });

  it('generates a report and sends an email only for companies with a contact_email', async () => {
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].path).toMatch(/^reports\/co-1\//);
    expect(uploaded[0].contentType).toBe('application/pdf');

    expect(db.tables.reports).toHaveLength(1);
    expect(db.tables.reports[0]).toMatchObject({ company_id: 'co-1', generated_by: null });
    expect(db.tables.reports[0].storage_path).toBe(uploaded[0].path);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('ops@acme.example');

    const body = await res.json();
    expect(body.tally).toMatchObject({ companies: 1, generated: 1, emailed: 1, failures: [] });
  });

  it('a second run the same month claims the same dedupe key and does not send a second email', async () => {
    await GET(req('s3cret'));
    const res2 = await GET(req('s3cret'));
    expect(sentEmails).toHaveLength(1); // not 2
    const body = await res2.json();
    expect(body.tally.alreadySent).toBe(1);
  });

  it('AUTOMATION_DISABLED=1 generates nothing', async () => {
    process.env.AUTOMATION_DISABLED = '1';
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(uploaded).toHaveLength(0);
    expect(db.tables.reports).toHaveLength(0);
  });
});
