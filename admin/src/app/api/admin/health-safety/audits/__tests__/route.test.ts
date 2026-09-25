import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The route's only job: validate, compute the score SERVER-SIDE (never
// trust a client-sent score), and call the one atomic RPC exactly once.
// The RPC's own transaction/idempotency guarantee is proven live
// against the real database (see CLAUDE.md, migration 110) — this pins
// the route's contract with it.

let role = 'tps_admin';
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: role ? { id: 'staff-1' } : null } }) },
    rpc: async (fn: string, args: unknown) => {
      if (fn === 'get_my_role') return { data: role, error: null };
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
  }),
}));

const { POST } = await import('../route');
const CO = '11111111-1111-4111-8111-111111111111';
const AUDIT_ID = '22222222-2222-4222-8222-222222222222';

function call(body: unknown) {
  return POST(new NextRequest('https://admin.example.com/api/admin/health-safety/audits', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
}

const validBody = () => ({
  id: AUDIT_ID, company_id: CO, site_id: null, template_id: null,
  title: 'Fire safety walk-round', conducted_on: '2026-09-24', notes: null,
  responses: [
    { template_item_id: null, prompt: 'Fire exits clear?', category: 'hs_fire', rating: 'fail', comment: 'Blocked by boxes' },
    { template_item_id: null, prompt: 'Extinguishers in date?', category: 'hs_fire', rating: 'pass', comment: null },
    { template_item_id: null, prompt: 'Alarm tested?', category: null, rating: 'na', comment: null },
  ],
});

beforeEach(() => {
  role = 'tps_admin';
  rpcCalls = [];
  rpcResult = { data: AUDIT_ID, error: null };
});

describe('POST /api/admin/health-safety/audits', () => {
  it('rejects a non-staff caller before touching the database', async () => {
    role = '';
    const res = await call(validBody());
    expect(res.status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it('rejects a malformed body (bad rating) before calling the RPC', async () => {
    const bad = validBody();
    (bad.responses[0] as { rating: string }).rating = 'meh';
    const res = await call(bad);
    expect(res.status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });

  it('rejects an empty responses array', async () => {
    const res = await call({ ...validBody(), responses: [] });
    expect(res.status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });

  it('computes the score server-side (ignoring na) and calls the RPC exactly once with it', async () => {
    const res = await call(validBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, id: AUDIT_ID, score: 50 }); // 1 pass, 1 fail, 1 na -> 50%
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('hs_submit_audit');
    expect(rpcCalls[0].args).toMatchObject({
      p_id: AUDIT_ID, p_company_id: CO, p_title: 'Fire safety walk-round', p_score: 50,
    });
    const responses = (rpcCalls[0].args as { p_responses: unknown[] }).p_responses;
    expect(responses).toHaveLength(3);
  });

  it('a client-sent score would be ignored even if present: score is always the server computation', async () => {
    await call({ ...validBody(), score: 0 } as unknown as ReturnType<typeof validBody>);
    const args = rpcCalls[0].args as { p_score: number };
    expect(args.p_score).toBe(50); // not 0 — the extra "score" field is simply not part of the schema
  });

  it('surfaces an RPC failure as a 500 rather than swallowing it', async () => {
    rpcResult = { data: null, error: { message: 'constraint violation' } };
    const res = await call(validBody());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('constraint violation');
  });
});
