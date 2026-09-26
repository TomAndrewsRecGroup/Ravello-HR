import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// The bulk/cohort action: one session, employees spanning any number of
// client companies, every link minted and emailed in this one call.

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

const req = (body: unknown) => new NextRequest('https://admin.example.com/api/admin/hs/tests/t1/sessions', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const params = Promise.resolve({ id: 't1' });

const CO1 = '11111111-1111-4111-8111-111111111111';
const CO2 = '22222222-2222-4222-8222-222222222222';
const EMP1 = '33333333-3333-4333-8333-333333333333';
const EMP2 = '44444444-4444-4444-8444-444444444444';
const EMP3 = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  sent.length = 0;
  db = fakeSupabase({
    hs_tests: [{ id: 't1', title: 'Manual Handling', source_type: 'manual', active: true }],
    hs_test_sessions: [], hs_test_assignments: [], hs_test_tokens: [], email_log: [],
    companies: [{ id: CO1, name: 'Acme Ltd' }, { id: CO2, name: 'Widgets Co' }],
    employee_records: [
      { id: EMP1, full_name: 'Jordan Lee', email: 'jordan@acme.com', company_id: CO1 },
      { id: EMP2, full_name: 'Sam Rae', email: 'sam@widgets.com', company_id: CO2 },
      { id: EMP3, full_name: 'No Email', email: null, company_id: CO1 },
    ],
  });
});

describe('POST /api/admin/hs/tests/[id]/sessions', () => {
  it('creates one session and assigns a cohort spanning multiple companies, sending every emailable invite', async () => {
    const res = await POST(req({
      title: 'Autumn refresher',
      cohort: [
        { company_id: CO1, employee_id: EMP1 },
        { company_id: CO2, employee_id: EMP2 },
        { company_id: CO1, employee_id: EMP3 },
      ],
    }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(db.tables.hs_test_sessions).toHaveLength(1);
    expect(db.tables.hs_test_assignments).toHaveLength(3);
    expect(body.assigned).toBe(3);
    expect(body.tally).toMatchObject({ sent: 2, no_email: 1, failed: 0, already: 0, not_found: 0 });
    expect(sent).toHaveLength(2);
    expect(db.tables.hs_test_tokens).toHaveLength(2);
  });

  it('404s for an unknown test', async () => {
    const res = await POST(req({ title: 'X', cohort: [{ company_id: CO1, employee_id: EMP1 }] }), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('refuses an empty cohort', async () => {
    const res = await POST(req({ title: 'X', cohort: [] }), { params });
    expect(res.status).toBe(400);
    expect(db.tables.hs_test_sessions).toHaveLength(0);
  });
});
