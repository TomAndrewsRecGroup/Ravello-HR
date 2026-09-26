import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// "Log a result" — the manual/link/ms_forms path. Never for a built_in
// test (that one marks itself on submission); always tells the client.

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

let db: FakeDb;
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => db.client,
}));

const { POST } = await import('../route');

const req = (body: unknown) => new NextRequest('https://admin.example.com/api/admin/hs/test-assignments/a1/log', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const params = Promise.resolve({ id: 'a1' });

beforeEach(() => {
  db = fakeSupabase({
    hs_tests: [{ id: 't1', title: 'Manual Handling', source_type: 'manual' }],
    hs_test_assignments: [{ id: 'a1', status: 'pending', company_id: 'co-1', employee_id: 'emp-1', test_id: 't1' }],
    employee_records: [{ id: 'emp-1', full_name: 'Jordan Lee' }],
    profiles: [{ id: 'ca', email: 'ca@client.com', role: 'client_admin', company_id: 'co-1' }],
    notification_preferences: [], notifications: [], email_log: [], hs_test_submissions: [],
  });
});

describe('POST /api/admin/hs/test-assignments/[id]/log', () => {
  it('logs a passed result and tells the client admins', async () => {
    const res = await POST(req({ passed: true, score: 92, notes: 'Great session' }), { params });
    expect(res.status).toBe(200);
    expect(db.tables.hs_test_submissions).toHaveLength(1);
    expect(db.tables.hs_test_submissions[0]).toMatchObject({ assignment_id: 'a1', passed: true, score: 92, recorded_by_kind: 'staff', source: 'manual' });
    const n = db.tables.notifications.find((x: any) => x.user_id === 'ca');
    expect(n).toMatchObject({ type: 'hs_test_result' });
    expect(n?.title).toContain('Jordan Lee');
    expect(n?.title).toContain('Passed');
  });

  it('refuses a built_in test — that one marks itself on submission', async () => {
    db.tables.hs_tests[0].source_type = 'built_in';
    const res = await POST(req({ passed: true }), { params });
    expect(res.status).toBe(400);
    expect(db.tables.hs_test_submissions).toHaveLength(0);
  });

  it('refuses an assignment that already has a result', async () => {
    db.tables.hs_test_assignments[0].status = 'completed';
    const res = await POST(req({ passed: true }), { params });
    expect(res.status).toBe(400);
    expect(db.tables.hs_test_submissions).toHaveLength(0);
  });

  it('404s for an unknown assignment', async () => {
    const res = await POST(req({ passed: true }), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});
