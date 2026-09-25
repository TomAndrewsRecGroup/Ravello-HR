import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// Convert an enquiry to a prospect: matched on the normalised name, so a
// second spelling joins the existing row; linked back; one follow-up
// task per enquiry however many times the button is pressed.

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }) }));
vi.mock('@/lib/rateLimit', () => ({
  limiters: { account: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k', rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));
let db: FakeDb;
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: () => db.client }));

const { POST } = await import('../route');
const ENQ = '11111111-1111-4111-8111-111111111111';
const convert = (body: unknown = {}) => POST(new NextRequest(`https://admin.example.com/api/admin/enquiries/${ENQ}/convert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: ENQ }) });

beforeEach(() => {
  db = fakeSupabase({
    enquiries: [{ id: ENQ, full_name: 'Pat Lee', email: 'pat@acme.com', company_name: 'ACME Limited', source: 'hr_risk', status: 'new', bd_company_id: null }],
    bd_companies: [{ id: 'bd-acme', company_name: 'Acme Ltd', company_name_normalised: 'acme', status: 'prospect', total_roles_seen: 4 }],
    internal_tasks: [],
  });
});

describe('POST /api/admin/enquiries/[id]/convert', () => {
  it('joins the existing prospect under another spelling, marks it contacted, links the enquiry, adds one task', async () => {
    const res = await convert();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, bd_company_id: 'bd-acme', created: false, task: true });
    expect(db.tables.bd_companies).toHaveLength(1);
    expect(db.tables.bd_companies[0].status).toBe('contacted');
    expect(db.tables.enquiries[0]).toMatchObject({ bd_company_id: 'bd-acme', status: 'contacted' });
    expect(db.tables.internal_tasks).toHaveLength(1);
    expect(db.tables.internal_tasks[0]).toMatchObject({ assigned_to: 'staff-1', created_by: 'staff-1', source_ref: `enquiry_followup:${ENQ}`, title: 'Follow up ACME Limited (Pat Lee)' });

    const again = await convert();
    expect(await again.json()).toMatchObject({ ok: true, bd_company_id: 'bd-acme', task: false });
    expect(db.tables.internal_tasks).toHaveLength(1);
  });

  it('creates the prospect when none matches, from the typed name when the enquiry has none', async () => {
    db.tables.enquiries[0].company_name = null;
    expect((await convert()).status).toBe(400);
    const res = await convert({ company_name: 'Globex Corporation Ltd' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: true, task: true });
    expect(db.tables.bd_companies).toHaveLength(2);
    expect(db.tables.bd_companies[1]).toMatchObject({ company_name: 'Globex Corporation Ltd', company_name_normalised: 'globex corporation', status: 'contacted', source: 'enquiry' });
    expect(db.tables.bd_companies[1].notes).toContain('pat@acme.com');
  });

  it('refuses a bad id and an unknown enquiry', async () => {
    expect((await POST(new NextRequest('https://a/x', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(400);
    db.tables.enquiries.length = 0;
    expect((await convert()).status).toBe(404);
  });
});
