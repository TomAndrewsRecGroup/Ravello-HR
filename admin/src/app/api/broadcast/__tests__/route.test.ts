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
// Core-OS 360 Completion Programme, Phase 25, Group 1 (C1.11): a stateful
// fake of broadcast_sends' own UNIQUE(id) constraint — a real 23505 on a
// repeated key, not merely a plausible-looking error shape, following
// this codebase's own established "recognise a duplicate by CODE, never
// by message text" rule (see CLAUDE.md, Phase 16 Group 3's own lesson).
let claimedKeys: Set<string>;
let claimedRows: any[];
let actionsInsertShouldFail: boolean;

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from(table: string) {
      if (table === 'companies') {
        return { select: () => ({ in: (_c: string, ids: string[]) => Promise.resolve({ data: companies.filter(c => ids.includes(c.id)), error: null }) }) };
      }
      if (table === 'broadcast_sends') {
        return {
          insert: (row: any) => {
            if (claimedKeys.has(row.id)) {
              return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
            }
            claimedKeys.add(row.id);
            claimedRows.push(row);
            return Promise.resolve({ error: null });
          },
          delete: () => ({
            eq: (_c: string, id: string) => { claimedKeys.delete(id); return Promise.resolve({ error: null }); },
          }),
        };
      }
      if (table === 'actions') {
        return {
          insert: (rows: any[]) => {
            if (actionsInsertShouldFail) {
              return { select: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }) };
            }
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
  claimedKeys = new Set();
  claimedRows = [];
  actionsInsertShouldFail = false;
});

const KEY_1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const KEY_2 = 'bbbbbbbb-2222-4222-8222-222222222222';

describe('POST /api/broadcast', () => {
  it('creates one action per selected company, emails only client_admins (never editors), and audits the recipient list', async () => {
    const res = await POST(req({
      company_ids: [COMPANY_A, COMPANY_B], title: 'New policy', action_type: 'compliance', priority: 'high', broadcast_key: KEY_1,
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
      company_ids: [COMPANY_A, MISSING], title: 'New policy', action_type: 'compliance', priority: 'normal', broadcast_key: KEY_1,
    }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
    expect(sent).toHaveLength(0);
    // Never claimed — company validation runs BEFORE the idempotency
    // claim, so a refused request leaves nothing behind for a real
    // retry (with corrected company_ids, under the same key) to trip on.
    expect(claimedKeys.has(KEY_1)).toBe(false);
  });

  it('refuses a malformed request (no title)', async () => {
    const res = await POST(req({ company_ids: [COMPANY_A], action_type: 'compliance', priority: 'normal', broadcast_key: KEY_1 }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('refuses a request with no broadcast_key at all', async () => {
    const res = await POST(req({ company_ids: [COMPANY_A], title: 'X', action_type: 'compliance', priority: 'normal' }));
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
    const res = await POST2(req({ company_ids: [COMPANY_A], title: 'X', action_type: 'compliance', priority: 'normal', broadcast_key: KEY_1 }));
    expect(res.status).toBe(401);
    expect(inserted).toHaveLength(0);
  });

  // Core-OS 360 Completion Programme, Phase 25, Group 1 (C1.11).
  it('a SECOND request under the SAME broadcast_key creates nothing and sends nothing — reported as a no-op success, never a second send', async () => {
    const first = await POST(req({
      company_ids: [COMPANY_A, COMPANY_B], title: 'New policy', action_type: 'compliance', priority: 'high', broadcast_key: KEY_1,
    }));
    expect(first.status).toBe(200);
    expect((await first.json()).created).toBe(2);
    expect(inserted).toHaveLength(2);
    expect(sent).toHaveLength(2);

    const second = await POST(req({
      company_ids: [COMPANY_A, COMPANY_B], title: 'New policy', action_type: 'compliance', priority: 'high', broadcast_key: KEY_1,
    }));
    expect(second.status).toBe(200);
    const body2 = await second.json();
    expect(body2).toMatchObject({ created: 0, duplicate: true });
    // Nothing further created or sent by the retry.
    expect(inserted).toHaveLength(2);
    expect(sent).toHaveLength(2);
    expect(auditCalls).toHaveLength(1);
  });

  it('a DIFFERENT broadcast_key is a genuinely new send, even with identical content', async () => {
    await POST(req({ company_ids: [COMPANY_A], title: 'New policy', action_type: 'compliance', priority: 'high', broadcast_key: KEY_1 }));
    const res = await POST(req({ company_ids: [COMPANY_A], title: 'New policy', action_type: 'compliance', priority: 'high', broadcast_key: KEY_2 }));
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(1);
    expect(inserted).toHaveLength(2);
  });

  it('reverts the claim when the actions insert itself fails, so a genuine retry under the same key is not permanently blocked', async () => {
    actionsInsertShouldFail = true;
    const failed = await POST(req({
      company_ids: [COMPANY_A], title: 'New policy', action_type: 'compliance', priority: 'high', broadcast_key: KEY_1,
    }));
    expect(failed.status).toBe(500);
    expect(claimedKeys.has(KEY_1)).toBe(false);

    actionsInsertShouldFail = false;
    const retried = await POST(req({
      company_ids: [COMPANY_A], title: 'New policy', action_type: 'compliance', priority: 'high', broadcast_key: KEY_1,
    }));
    expect(retried.status).toBe(200);
    expect((await retried.json()).created).toBe(1);
    expect(inserted).toHaveLength(1);
  });

  // Core-OS 360 Completion Programme, Phase 25, Group 6 (C17.7).
  const LEGAL_ID = 'cccccccc-3333-4333-8333-333333333333';

  it('a broadcast carrying source_type/source_id records them on the claim row AND propagates source_type: regulatory_broadcast onto every created action, keyed by the broadcast_key', async () => {
    const res = await POST(req({
      company_ids: [COMPANY_A, COMPANY_B], title: 'Legal update', action_type: 'compliance', priority: 'high',
      broadcast_key: KEY_1, source_type: 'legal_requirement', source_id: LEGAL_ID,
    }));
    expect(res.status).toBe(200);
    expect(claimedRows[0]).toMatchObject({ source_type: 'legal_requirement', source_id: LEGAL_ID });
    expect(inserted).toHaveLength(2);
    expect(inserted.every(a => a.source_type === 'regulatory_broadcast' && a.source_id === KEY_1)).toBe(true);
  });

  it('an ordinary hand-typed broadcast (no source_type) leaves both the claim row and the created actions without a source_type — unchanged from before this group', async () => {
    const res = await POST(req({
      company_ids: [COMPANY_A], title: 'Hand typed', action_type: 'compliance', priority: 'normal', broadcast_key: KEY_1,
    }));
    expect(res.status).toBe(200);
    expect(claimedRows[0].source_type).toBeNull();
    expect(claimedRows[0].source_id).toBeNull();
    expect(inserted[0].source_type).toBeUndefined();
    expect(inserted[0].source_id).toBeUndefined();
  });

  it('refuses source_type without source_id (a half pair), before any claim or write', async () => {
    const res = await POST(req({
      company_ids: [COMPANY_A], title: 'X', action_type: 'compliance', priority: 'normal', broadcast_key: KEY_1,
      source_type: 'legal_requirement',
    }));
    expect(res.status).toBe(400);
    expect(claimedKeys.has(KEY_1)).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('refuses an unrecognised source_type value', async () => {
    const res = await POST(req({
      company_ids: [COMPANY_A], title: 'X', action_type: 'compliance', priority: 'normal', broadcast_key: KEY_1,
      source_type: 'bogus', source_id: LEGAL_ID,
    }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });
});
