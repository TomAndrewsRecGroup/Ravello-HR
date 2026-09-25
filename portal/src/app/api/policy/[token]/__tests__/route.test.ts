import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashAccessToken } from '@/lib/auth/accessTokens';

// The public acknowledgement route: GET returns the minimum the page
// needs (who, which document, a signed URL) and nothing private; POST
// acknowledges once and burns the links; expired and unknown links are
// refused. Drives the real handlers against a small stateful fake.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const signed: string[] = [];

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
    if (op === 'insert') { rows.push(...payload); return { data: null, error: null }; }
    if (op === 'delete') { tables[name] = rows.filter(r => !hit.includes(r)); return { data: null, error: null }; }
    hit.forEach(r => Object.assign(r, patch));
    return { data: null, error: null, count: wantCount ? hit.length : null };
  }
  return q;
}
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/storage/files', () => ({ signFileUrl: async (_sb: unknown, bucket: string, path: string) => { signed.push(`${bucket}/${path}`); return `https://signed.example/${path}`; } }));
vi.mock('@/lib/rateLimit', () => ({ createRateLimiter: () => ({ check: () => ({ allowed: true, resetAt: 0 }) }), getRateLimitKey: () => 'ip' }));

const { GET, POST } = await import('../route');
const TOKEN = '11111111-2222-4333-8444-555555555555';
const req = (method: string, token: string, body?: unknown) => new NextRequest(`https://portal.example.com/api/policy/${token}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(async () => {
  signed.length = 0;
  tables = {
    policy_ack_tokens: [{ token_hash: await hashAccessToken(TOKEN), acknowledgement_id: 'ack-1', expires_at: '2099-01-01T00:00:00Z' }],
    policy_acknowledgements: [{ id: 'ack-1', company_id: 'co-1', document_id: 'doc-1', employee_id: 'emp-1', status: 'pending', acknowledged_at: null }],
    employee_records: [{ id: 'emp-1', full_name: 'Ada Lovelace', email: 'ada@x.com', salary: 52000, status: 'active' }],
    documents: [{ id: 'doc-1', name: 'Remote Working Policy', category: 'policy', version: 2, file_path: 'co-1/policies/remote.pdf', file_url: null, notes: 'internal' }],
    companies: [{ id: 'co-1', name: 'Sample Co' }],
  };
});

describe('GET /api/policy/[token]', () => {
  it('returns who, which document and a signed URL, and nothing private', async () => {
    const res = await GET(req('GET', TOKEN), ctx(TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ employee: { name: 'Ada Lovelace' }, company: { name: 'Sample Co' }, document: { name: 'Remote Working Policy', category: 'policy', version: 2, url: 'https://signed.example/co-1/policies/remote.pdf' }, status: 'pending', acknowledged_at: null });
    expect(JSON.stringify(body)).not.toMatch(/ada@x.com|52000|internal/);
    expect(signed).toEqual(['documents/co-1/policies/remote.pdf']);
  });
  it('an external URL is passed through; a missing file gives null', async () => {
    tables.documents[0].file_path = null; tables.documents[0].file_url = 'https://drive.example/doc';
    expect((await (await GET(req('GET', TOKEN), ctx(TOKEN))).json()).document.url).toBe('https://drive.example/doc');
    tables.documents[0].file_url = null;
    expect((await (await GET(req('GET', TOKEN), ctx(TOKEN))).json()).document.url).toBeNull();
  });
  it('refuses a malformed, unknown or expired link, and a leaver', async () => {
    expect((await GET(req('GET', 'nope'), ctx('nope'))).status).toBe(404);
    const other = '99999999-2222-4333-8444-555555555555';
    expect((await GET(req('GET', other), ctx(other))).status).toBe(404);
    tables.policy_ack_tokens[0].expires_at = '2020-01-01T00:00:00Z';
    expect((await GET(req('GET', TOKEN), ctx(TOKEN))).status).toBe(410);
    tables.policy_ack_tokens[0].expires_at = '2099-01-01T00:00:00Z';
    tables.employee_records[0].status = 'terminated';
    expect((await GET(req('GET', TOKEN), ctx(TOKEN))).status).toBe(410);
  });
});

describe('POST /api/policy/[token]', () => {
  it('needs the confirmation, acknowledges once via the link, burns the links, and a second press says already', async () => {
    expect((await POST(req('POST', TOKEN, { confirmed: false }), ctx(TOKEN))).status).toBe(400);
    expect(tables.policy_acknowledgements[0].status).toBe('pending');
    const res = await POST(req('POST', TOKEN, { confirmed: true }), ctx(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, already: false });
    expect(tables.policy_acknowledgements[0]).toMatchObject({ status: 'acknowledged', acknowledged_via: 'link' });
    expect(tables.policy_acknowledgements[0].acknowledged_at).toBeTruthy();
    expect(tables.policy_ack_tokens).toHaveLength(0);
    expect((await POST(req('POST', TOKEN, { confirmed: true }), ctx(TOKEN))).status).toBe(404);   // the link is gone
  });
  it('an expired link cannot acknowledge', async () => {
    tables.policy_ack_tokens[0].expires_at = '2020-01-01T00:00:00Z';
    expect((await POST(req('POST', TOKEN, { confirmed: true }), ctx(TOKEN))).status).toBe(410);
    expect(tables.policy_acknowledgements[0].status).toBe('pending');
  });
});
