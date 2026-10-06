import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The send route: claim-first (status='draft' -> 'sent_for_signature' or
// straight to 'signed' when no signature is required), then mint a
// token/send an email or finalise a PDF directly — never a second
// concurrent send, and a client_admin may only send their OWN
// company's instance.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const emailCalls: string[] = [];
let uploadShouldFail = false;
let session: { userId: string; email: string | null; role: string; companyId: string | null } | null;

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
  let patch: Row = {}; let wantCount = false; let single: 'maybe' | null = null; let payload: Row[] = [];
  const q: any = {
    select() { return q; },
    insert(rows: Row | Row[]) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
    update(p: Row, o?: { count?: string }) { op = 'update'; patch = p; wantCount = !!o?.count; return q; },
    delete() { op = 'delete'; return q; },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
    maybeSingle() { single = 'maybe'; return q; },
    then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const rows = (tables[name] ??= []);
    const hit = rows.filter(r => filters.every(f => f(r)));
    if (op === 'select') return { data: single ? hit[0] ?? null : hit, error: null };
    if (op === 'insert') { rows.push(...payload); return { data: null, error: null }; }
    if (op === 'delete') { tables[name] = rows.filter(r => !hit.includes(r)); return { data: null, error: null }; }
    const matched = hit.length;
    hit.forEach(r => Object.assign(r, patch));
    return { data: null, error: null, count: wantCount ? matched : null };
  }
  return q;
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (t: string) => builder(t),
    storage: { from: () => ({ upload: async () => (uploadShouldFail ? { error: { message: 'upload failed' } } : { error: null }) }) },
  }),
}));
vi.mock('@/lib/auth/liveSession', () => ({ requireLiveSession: () => Promise.resolve(session) }));
vi.mock('@/lib/rateLimit', () => ({ limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } }, getUserRateLimitKey: () => 'user', rateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock('@/lib/email', () => ({ sendEmail: (e: { to: string; subject: string }) => { emailCalls.push(`${e.to}:${e.subject}`); return Promise.resolve({ id: 'resend-1', delivered: true }); } }));

const { POST } = await import('../route');
const req = () => new NextRequest('https://portal.example.com/api/lead/document-templates/11111111-2222-4333-8444-555555555555/send', { method: 'POST' });
const ctx = () => ({ params: Promise.resolve({ id: '11111111-2222-4333-8444-555555555555' }) });

beforeEach(() => {
  emailCalls.length = 0;
  uploadShouldFail = false;
  session = { userId: 'user-1', email: 'admin@acme.example', role: 'client_admin', companyId: 'co-1' };
  tables = {
    document_instances: [{
      id: '11111111-2222-4333-8444-555555555555', company_id: 'co-1', employee_id: 'emp-1', rendered_title: 'Contract — Ada',
      rendered_body: 'Dear Ada,\n\nYou are hired.', requires_signature: true, status: 'draft',
    }],
    employee_records: [{ id: 'emp-1', full_name: 'Ada Lovelace', email: 'ada@example.com' }],
    document_signature_tokens: [],
  };
});

describe('POST /api/lead/document-templates/[id]/send', () => {
  it('a plain client_user is refused', async () => {
    session!.role = 'client_user';
    expect((await POST(req(), ctx())).status).toBe(403);
    expect(tables.document_instances[0].status).toBe('draft');
  });

  it('refuses a different company’s instance', async () => {
    session!.companyId = 'co-2';
    expect((await POST(req(), ctx())).status).toBe(404);
  });

  it('a template requiring signature mints a token and emails the sign link, never finalising a PDF yet', async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'sent_for_signature' });
    expect(tables.document_instances[0]).toMatchObject({ status: 'sent_for_signature' });
    expect(tables.document_instances[0].sent_for_signature_at).toBeTruthy();
    expect(tables.document_signature_tokens).toHaveLength(1);
    expect(emailCalls).toEqual(['ada@example.com:Please sign: Contract — Ada']);
  });

  it('a template with no signature requirement finalises directly: signed, a stored PDF, a plain notice email', async () => {
    tables.document_instances[0].requires_signature = false;
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'signed' });
    expect(tables.document_instances[0]).toMatchObject({ status: 'signed' });
    expect(tables.document_instances[0].storage_path).toMatch(/^documents\/co-1\//);
    expect(tables.document_signature_tokens).toHaveLength(0); // nothing to sign, nothing minted
    expect(emailCalls).toEqual(['ada@example.com:Contract — Ada']);
  });

  it('refuses to send a document already sent, signed, declined or voided', async () => {
    tables.document_instances[0].status = 'signed';
    expect((await POST(req(), ctx())).status).toBe(409);
  });

  it('refuses an employee with no email on file', async () => {
    tables.employee_records[0].email = null;
    expect((await POST(req(), ctx())).status).toBe(400);
    expect(tables.document_instances[0].status).toBe('draft');
  });

  it('reverts the claim to draft if finalising a no-signature document fails', async () => {
    tables.document_instances[0].requires_signature = false;
    uploadShouldFail = true;
    const res = await POST(req(), ctx());
    expect(res.status).toBe(500);
    expect(tables.document_instances[0].status).toBe('draft');
    expect(tables.document_instances[0].signed_at).toBeFalsy();
  });

  it('staff may send on behalf of any company', async () => {
    session = { userId: 'staff-1', email: 'staff@x.com', role: 'tps_admin', companyId: null };
    tables.document_instances[0].company_id = 'some-other-co';
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
  });
});
