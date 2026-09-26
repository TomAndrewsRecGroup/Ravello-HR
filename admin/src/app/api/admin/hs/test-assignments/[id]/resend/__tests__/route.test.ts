import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

let db: FakeDb;
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => db.client,
}));

const sent: any[] = [];
vi.mock('@/lib/email', async () => {
  const tpl = await import('@/lib/email/templates/notification');
  return {
    ...tpl,
    sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { id: 'r', delivered: true }; },
    lastEmailError: () => null,
  };
});

const { POST } = await import('../route');

const req = () => new NextRequest('https://admin.example.com/api/admin/hs/test-assignments/a1/resend', { method: 'POST' });
const params = Promise.resolve({ id: 'a1' });

beforeEach(() => {
  sent.length = 0;
  db = fakeSupabase({
    hs_tests: [{ id: 't1', title: 'Manual Handling' }],
    hs_test_assignments: [{ id: 'a1', status: 'pending', company_id: 'co-1', employee_id: 'emp-1', test_id: 't1', session_id: null }],
    employee_records: [{ id: 'emp-1', full_name: 'Jordan Lee', email: 'jordan@acme.com' }],
    companies: [{ id: 'co-1', name: 'Acme Ltd' }],
    hs_test_tokens: [], email_log: [],
  });
});

describe('POST /api/admin/hs/test-assignments/[id]/resend', () => {
  it('mints and sends a fresh link', async () => {
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(db.tables.hs_test_tokens).toHaveLength(1);
  });

  it('404s for an unknown assignment', async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('refuses an already-completed assignment', async () => {
    db.tables.hs_test_assignments[0].status = 'completed';
    const res = await POST(req(), { params });
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('400s when the employee has no email on record', async () => {
    db.tables.employee_records[0].email = null;
    const res = await POST(req(), { params });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.outcome).toBe('no_email');
  });
});
