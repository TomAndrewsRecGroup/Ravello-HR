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

const { POST } = await import('../route');

const req = (body: unknown) => new NextRequest('https://admin.example.com/api/admin/hs/tests', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  db = fakeSupabase({ hs_tests: [] });
});

describe('POST /api/admin/hs/tests', () => {
  it('creates a built_in test with valid questions', async () => {
    const res = await POST(req({
      title: 'Fire Warden Refresher', source_type: 'built_in', pass_mark: 70,
      questions: [{ id: '11111111-1111-4111-8111-111111111111', prompt: 'Q1', options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }], correct_option_id: 'a' }],
    }));
    expect(res.status).toBe(200);
    expect(db.tables.hs_tests).toHaveLength(1);
    expect(db.tables.hs_tests[0]).toMatchObject({ title: 'Fire Warden Refresher', source_type: 'built_in', pass_mark: 70 });
  });

  it('refuses a built_in test with no questions', async () => {
    const res = await POST(req({ title: 'X', source_type: 'built_in', pass_mark: 70, questions: [] }));
    expect(res.status).toBe(400);
    expect(db.tables.hs_tests).toHaveLength(0);
  });

  it('refuses a link test with no URL', async () => {
    const res = await POST(req({ title: 'X', source_type: 'link' }));
    expect(res.status).toBe(400);
    expect(db.tables.hs_tests).toHaveLength(0);
  });

  it('a manual test needs neither a URL nor questions', async () => {
    const res = await POST(req({ title: 'In-person practical', source_type: 'manual' }));
    expect(res.status).toBe(200);
    expect(db.tables.hs_tests[0]).toMatchObject({ source_type: 'manual', external_url: null, questions: null });
  });

  it('a question whose correct_option_id names no real option is refused', async () => {
    const res = await POST(req({
      title: 'X', source_type: 'built_in', pass_mark: 70,
      questions: [{ id: '11111111-1111-4111-8111-111111111111', prompt: 'Q1', options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }], correct_option_id: 'z' }],
    }));
    expect(res.status).toBe(400);
  });
});
