import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The void route: cancels a document before it has been actioned.
// document_instances_lifecycle_guard() (215) is the real guard — this
// fake does NOT re-implement its state machine, it only reproduces the
// one shape the route's own query relies on: a conditional UPDATE
// scoped to .in('status', ['draft', 'sent_for_signature']) either
// matches (count: 1) or doesn't (count: 0), exactly as RLS/the guard
// would leave it.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let session: { userId: string; email: string | null; role: string; companyId: string | null } | null;

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'update' = 'select';
  let patch: Row = {}; let wantCount = false; let single: 'maybe' | null = null;
  const q: any = {
    select() { return q; },
    update(p: Row, o?: { count?: string }) { op = 'update'; patch = p; wantCount = !!o?.count; return q; },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
    in(c: string, vs: unknown[]) { filters.push(r => vs.includes(r[c])); return q; },
    maybeSingle() { single = 'maybe'; return q; },
    then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const rows = (tables[name] ??= []);
    const hit = rows.filter(r => filters.every(f => f(r)));
    if (op === 'select') return { data: single ? hit[0] ?? null : hit, error: null };
    const matched = hit.length;
    hit.forEach(r => Object.assign(r, patch));
    return { data: null, error: null, count: wantCount ? matched : null };
  }
  return q;
}

vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/auth/liveSession', () => ({ requireLiveSession: () => Promise.resolve(session) }));
vi.mock('@/lib/rateLimit', () => ({ limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } }, getUserRateLimitKey: () => 'user', rateLimitResponse: () => new Response(null, { status: 429 }) }));

const { POST } = await import('../route');
const req = () => new NextRequest('https://portal.example.com/api/lead/document-templates/11111111-2222-4333-8444-555555555555/void', { method: 'POST' });
const ctx = () => ({ params: Promise.resolve({ id: '11111111-2222-4333-8444-555555555555' }) });

beforeEach(() => {
  session = { userId: 'user-1', email: 'admin@acme.example', role: 'client_admin', companyId: 'co-1' };
  tables = {
    document_instances: [{ id: '11111111-2222-4333-8444-555555555555', company_id: 'co-1', status: 'draft' }],
  };
});

describe('POST /api/lead/document-templates/[id]/void', () => {
  it('a plain client_user is refused', async () => {
    session!.role = 'client_user';
    expect((await POST(req(), ctx())).status).toBe(403);
    expect(tables.document_instances[0].status).toBe('draft');
  });

  it('refuses a different company’s instance', async () => {
    session!.companyId = 'co-2';
    expect((await POST(req(), ctx())).status).toBe(404);
  });

  it('voids a draft document', async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(tables.document_instances[0].status).toBe('voided');
  });

  it('voids a document awaiting signature', async () => {
    tables.document_instances[0].status = 'sent_for_signature';
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(tables.document_instances[0].status).toBe('voided');
  });

  it('refuses to void an already-signed, declined or voided document', async () => {
    for (const s of ['signed', 'declined', 'voided']) {
      tables.document_instances[0].status = s;
      const res = await POST(req(), ctx());
      expect(res.status).toBe(409);
      expect(tables.document_instances[0].status).toBe(s);
    }
  });

  it('staff may void on behalf of any company', async () => {
    session = { userId: 'staff-1', email: 'staff@x.com', role: 'tps_admin', companyId: null };
    tables.document_instances[0].company_id = 'some-other-co';
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
  });
});
