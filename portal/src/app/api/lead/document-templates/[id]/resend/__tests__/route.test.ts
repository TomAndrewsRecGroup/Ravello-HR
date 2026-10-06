import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The resend route: mints a NEW token and emails it again. Never
// touches status (so no claim-first race to prove here), never burns
// the existing link.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const emailCalls: string[] = [];
let session: { userId: string; email: string | null; role: string; companyId: string | null } | null;

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' = 'select';
  let single: 'maybe' | null = null; let payload: Row[] = [];
  const q: any = {
    select() { return q; },
    insert(rows: Row | Row[]) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
    maybeSingle() { single = 'maybe'; return q; },
    then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const rows = (tables[name] ??= []);
    const hit = rows.filter(r => filters.every(f => f(r)));
    if (op === 'select') return { data: single ? hit[0] ?? null : hit, error: null };
    rows.push(...payload); return { data: null, error: null };
  }
  return q;
}

vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/auth/liveSession', () => ({ requireLiveSession: () => Promise.resolve(session) }));
vi.mock('@/lib/rateLimit', () => ({ limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } }, getUserRateLimitKey: () => 'user', rateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock('@/lib/email', () => ({ sendEmail: (e: { to: string; subject: string }) => { emailCalls.push(`${e.to}:${e.subject}`); return Promise.resolve({ id: 'resend-1', delivered: true }); } }));

const { POST } = await import('../route');
const req = () => new NextRequest('https://portal.example.com/api/lead/document-templates/11111111-2222-4333-8444-555555555555/resend', { method: 'POST' });
const ctx = () => ({ params: Promise.resolve({ id: '11111111-2222-4333-8444-555555555555' }) });

beforeEach(() => {
  emailCalls.length = 0;
  session = { userId: 'user-1', email: 'admin@acme.example', role: 'client_admin', companyId: 'co-1' };
  tables = {
    document_instances: [{
      id: '11111111-2222-4333-8444-555555555555', company_id: 'co-1', employee_id: 'emp-1',
      rendered_title: 'Contract — Ada', status: 'sent_for_signature',
    }],
    employee_records: [{ id: 'emp-1', full_name: 'Ada Lovelace', email: 'ada@example.com' }],
    document_signature_tokens: [],
  };
});

describe('POST /api/lead/document-templates/[id]/resend', () => {
  it('a plain client_user is refused', async () => {
    session!.role = 'client_user';
    expect((await POST(req(), ctx())).status).toBe(403);
  });

  it('refuses a different company’s instance', async () => {
    session!.companyId = 'co-2';
    expect((await POST(req(), ctx())).status).toBe(404);
  });

  it('mints a new token and emails the sign link again, leaving status untouched', async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(tables.document_instances[0].status).toBe('sent_for_signature');
    expect(tables.document_signature_tokens).toHaveLength(1);
    expect(emailCalls).toEqual(['ada@example.com:Please sign: Contract — Ada']);
  });

  it('refuses to resend a document not currently awaiting a signature', async () => {
    tables.document_instances[0].status = 'draft';
    expect((await POST(req(), ctx())).status).toBe(409);
  });

  it('refuses an employee with no email on file', async () => {
    tables.employee_records[0].email = null;
    expect((await POST(req(), ctx())).status).toBe(400);
  });

  it('staff may resend on behalf of any company', async () => {
    session = { userId: 'staff-1', email: 'staff@x.com', role: 'tps_admin', companyId: null };
    tables.document_instances[0].company_id = 'some-other-co';
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
  });
});
