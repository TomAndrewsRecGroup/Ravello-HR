// Phase 20 (Core-OS 360 Completion Programme) baseline preservation test.
//
// Broadcast previously had only one pure-function test
// (governance/broadcastPrefill.test.ts, which covers the LEGAL prefill
// mapping, not the send itself). This drives the real POST handler end
// to end: staff auth -> validation -> company existence check -> one
// `actions` row per company -> an email to each company's client_admin
// -> the audit trail -> and that an invalid/nonexistent company refuses
// the WHOLE broadcast rather than silently dropping just that one.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));
vi.mock('@/lib/rateLimit', () => ({
  limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse:   () => new Response('rate limited', { status: 429 }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/portalUrl', () => ({ portalUrl: () => 'https://portal.example.com' }));

const auditCalls: any[] = [];
vi.mock('@/lib/audit', () => ({ auditLog: (e: any) => { auditCalls.push(e); } }));

const sent: any[] = [];
vi.mock('@/lib/email', () => ({
  sendEmail: (m: any) => { sent.push(m); return Promise.resolve({ id: 'resend-1', delivered: true }); },
  actionAssignedEmail: (opts: any) => ({ to: opts.to, subject: `Action: ${opts.title}`, companyName: opts.companyName }),
}));

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const MISSING   = '99999999-9999-4999-8999-999999999999';

let companies: any[];
let profiles: any[];
const inserted: any[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from(table: string) {
      if (table === 'companies') {
        return { select: () => ({ in: (_c: string, ids: string[]) => Promise.resolve({ data: companies.filter(c => ids.includes(c.id)), error: null }) }) };
      }
      if (table === 'actions') {
        return {
          insert: (rows: any[]) => {
            inserted.push(...rows);
            return { select: () => Promise.resolve({ data: rows.map((_r, i) => ({ id: `a${inserted.length - rows.length + i}` })), error: null }) };
          },
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: (_c: string, ids: string[]) => ({
              eq: (_r: string, role: string) => Promise.resolve({
                data: profiles.filter(p => ids.includes(p.company_id) && p.role === role),
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { POST } = await import('../route');

const req = (body: unknown) => new NextRequest('https://admin.example.com/api/broadcast', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  companies = [{ id: COMPANY_A, name: 'Acme Ltd' }, { id: COMPANY_B, name: 'Beta Ltd' }];
  profiles = [
    { email: 'admin-a@acme.test', company_id: COMPANY_A, role: 'client_admin', companies: { name: 'Acme Ltd' } },
    { email: 'admin-b@beta.test', company_id: COMPANY_B, role: 'client_admin', companies: { name: 'Beta Ltd' } },
    { email: 'editor-a@acme.test', company_id: COMPANY_A, role: 'client_editor', companies: { name: 'Acme Ltd' } },
  ];
  inserted.length = 0;
  sent.length = 0;
  auditCalls.length = 0;
});

describe('POST /api/broadcast', () => {
  it('creates one action per selected company, emails only client_admins (never editors), and audits the recipient list', async () => {
    const res = await POST(req({
      company_ids: [COMPANY_A, COMPANY_B], title: 'New policy', action_type: 'compliance', priority: 'high',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(inserted).toHaveLength(2);
    expect(inserted.every(a => a.created_by_admin === true && a.status === 'active')).toBe(true);

    expect(sent).toHaveLength(2);
    expect(sent.map(s => s.to).sort()).toEqual(['admin-a@acme.test', 'admin-b@beta.test']);

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({ action: 'broadcast.sent', actor_id: 'staff-1' });
    expect(auditCalls[0].metadata.company_ids.sort()).toEqual([COMPANY_A, COMPANY_B].sort());
  });

  it('refuses the WHOLE broadcast when one company_id does not exist — never a silent partial send', async () => {
    const res = await POST(req({
      company_ids: [COMPANY_A, MISSING], title: 'New policy', action_type: 'compliance', priority: 'normal',
    }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('refuses a malformed request (no title)', async () => {
    const res = await POST(req({ company_ids: [COMPANY_A], action_type: 'compliance', priority: 'normal' }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('refuses an unauthenticated/non-staff caller before touching the database', async () => {
    // The top-level requireStaff mock returns ok:true for every other case
    // in this file; re-mock it just for this isolated module instance so
    // the refusal path is exercised against the real route logic rather
    // than asserted from the outside.
    vi.doMock('@/lib/auth/requireStaff', () => ({
      requireStaff: () => Promise.resolve({ ok: false, response: new Response('unauthorized', { status: 401 }) }),
    }));
    vi.resetModules();
    const { POST: POST2 } = await import('../route');
    const res = await POST2(req({ company_ids: [COMPANY_A], title: 'X', action_type: 'compliance', priority: 'normal' }));
    expect(res.status).toBe(401);
    expect(inserted).toHaveLength(0);
  });
});
