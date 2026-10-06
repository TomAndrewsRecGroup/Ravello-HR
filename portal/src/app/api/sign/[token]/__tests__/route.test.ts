import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashAccessToken } from '@/lib/auth/accessTokens';

// The public e-signature route: GET returns the minimum the page needs
// (who, which document, current status) and nothing private; POST
// signs or declines ONCE (claim-first), burns every link for the
// instance, and reverts the claim if finalising fails. Drives the real
// handlers against a small stateful fake — the /api/policy/[token]
// precedent, extended with a storage.upload() stub this route also needs.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const emailCalls: string[] = [];
let uploadShouldFail = false;
const uploadedPaths: string[] = [];

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
    in(c: string, vs: unknown[]) { filters.push(r => vs.includes(r[c])); return q; },
    maybeSingle() { single = 'maybe'; return q; },
    then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const rows = (tables[name] ??= []);
    const hit = rows.filter(r => filters.every(f => f(r)));
    if (op === 'select') return { data: single ? hit[0] ?? null : hit, error: null };
    if (op === 'insert') {
      if (name === 'email_log') {
        const key = payload[0]?.dedupe_key;
        if (key && rows.some(r => r.dedupe_key === key)) return { data: null, error: { message: 'duplicate key', code: '23505' } };
      }
      rows.push(...payload); return { data: null, error: null };
    }
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
    storage: { from: () => ({ upload: async (path: string) => { uploadedPaths.push(path); return uploadShouldFail ? { error: { message: 'upload failed' } } : { error: null }; } }) },
  }),
}));
vi.mock('@/lib/rateLimit', () => ({ createRateLimiter: () => ({ check: () => ({ allowed: true, resetAt: 0 }) }), getRateLimitKey: () => 'ip' }));
vi.mock('@/lib/email', () => ({ sendEmail: (e: { to: string; subject: string }) => { emailCalls.push(`${e.to}:${e.subject}`); return Promise.resolve({ id: 'resend-1', delivered: true }); } }));

const { GET, POST } = await import('../route');
const TOKEN = '11111111-2222-4333-8444-555555555555';
const req = (method: string, token: string, body?: unknown) =>
  new NextRequest(`https://portal.example.com/api/sign/${token}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(async () => {
  emailCalls.length = 0;
  uploadedPaths.length = 0;
  uploadShouldFail = false;
  tables = {
    document_signature_tokens: [{ token_hash: await hashAccessToken(TOKEN), document_instance_id: 'inst-1', expires_at: '2099-01-01T00:00:00Z' }],
    document_instances: [{
      id: 'inst-1', company_id: 'co-1', employee_id: 'emp-1', rendered_title: 'Employment Contract — Ada Lovelace',
      rendered_body: 'Dear Ada,\n\nYou are hired.', requires_signature: true, status: 'sent_for_signature',
      created_by: 'staff-1', signed_at: null, signed_by_name: null, declined_at: null, declined_reason: null,
    }],
    employee_records: [{ id: 'emp-1', full_name: 'Ada Lovelace' }],
    companies: [{ id: 'co-1', name: 'Sample Co' }],
    profiles: [{ id: 'staff-1', email: 'staff@example.com' }],
    email_log: [],
  };
});

describe('GET /api/sign/[token]', () => {
  it('returns who, which document and its status, and nothing private', async () => {
    const res = await GET(req('GET', TOKEN), ctx(TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      employee: { name: 'Ada Lovelace' }, company: { name: 'Sample Co' },
      document: { title: 'Employment Contract — Ada Lovelace', body: 'Dear Ada,\n\nYou are hired.' },
      status: 'sent_for_signature',
    });
  });
  it('refuses a malformed, unknown or expired link', async () => {
    expect((await GET(req('GET', 'nope'), ctx('nope'))).status).toBe(404);
    const other = '99999999-2222-4333-8444-555555555555';
    expect((await GET(req('GET', other), ctx(other))).status).toBe(404);
    tables.document_signature_tokens[0].expires_at = '2020-01-01T00:00:00Z';
    expect((await GET(req('GET', TOKEN), ctx(TOKEN))).status).toBe(410);
  });
});

describe('POST /api/sign/[token]', () => {
  it('signs once, generates the final PDF, burns the token, notifies the sender, and a second submit says already', async () => {
    const res = await POST(req('POST', TOKEN, { action: 'sign', consent: true, signedByName: 'Ada Lovelace' }), ctx(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'signed' });

    const inst = tables.document_instances[0];
    expect(inst).toMatchObject({ status: 'signed', signed_by_name: 'Ada Lovelace' });
    expect(inst.signed_at).toBeTruthy();
    expect(inst.storage_path).toMatch(/^documents\/co-1\//);
    expect(uploadedPaths).toHaveLength(1);
    expect(tables.document_signature_tokens).toHaveLength(0); // burned
    expect(emailCalls).toEqual(['staff@example.com:Employment Contract — Ada Lovelace was signed']);

    // The link is gone — a retry finds no token at all, not a stale instance.
    const again = await POST(req('POST', TOKEN, { action: 'sign', consent: true, signedByName: 'Ada Lovelace' }), ctx(TOKEN));
    expect(again.status).toBe(404);
  });

  it('declines with a reason, never generates a PDF, and still notifies the sender once', async () => {
    const res = await POST(req('POST', TOKEN, { action: 'decline', reason: 'Salary looks wrong' }), ctx(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'declined' });
    expect(tables.document_instances[0]).toMatchObject({ status: 'declined', declined_reason: 'Salary looks wrong' });
    expect(uploadedPaths).toHaveLength(0);
    expect(tables.document_signature_tokens).toHaveLength(0);
    expect(emailCalls).toHaveLength(1);
  });

  it('reports "already" rather than erroring when the instance is no longer sent_for_signature', async () => {
    tables.document_instances[0].status = 'signed';
    const res = await POST(req('POST', TOKEN, { action: 'sign', consent: true, signedByName: 'Ada Lovelace' }), ctx(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, already: true, status: 'signed' });
  });

  it('reverts the claim back to sent_for_signature if the PDF cannot be stored', async () => {
    uploadShouldFail = true;
    const res = await POST(req('POST', TOKEN, { action: 'sign', consent: true, signedByName: 'Ada Lovelace' }), ctx(TOKEN));
    expect(res.status).toBe(500);
    expect(tables.document_instances[0].status).toBe('sent_for_signature');
    expect(tables.document_instances[0].signed_by_name).toBeNull();
    // the token was never burned, so the employee can simply try again
    expect(tables.document_signature_tokens).toHaveLength(1);
  });

  it('requires consent and a signed-by name to sign', async () => {
    expect((await POST(req('POST', TOKEN, { action: 'sign', consent: true, signedByName: '' }), ctx(TOKEN))).status).toBe(400);
    expect((await POST(req('POST', TOKEN, { action: 'sign', consent: false, signedByName: 'Ada' }), ctx(TOKEN))).status).toBe(400);
  });

  it('an expired link cannot sign', async () => {
    tables.document_signature_tokens[0].expires_at = '2020-01-01T00:00:00Z';
    expect((await POST(req('POST', TOKEN, { action: 'sign', consent: true, signedByName: 'Ada' }), ctx(TOKEN))).status).toBe(410);
    expect(tables.document_instances[0].status).toBe('sent_for_signature');
  });
});
