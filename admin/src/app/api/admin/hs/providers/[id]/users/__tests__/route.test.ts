// The provider invite route runs with the SERVICE ROLE, which the
// profile guard (088/093) exempts, so it is its own boundary. What must
// hold: the login it makes is ALWAYS an hs_provider with no company,
// whatever the body says, and an existing client or staff account is
// never converted into one. Drives the real POST against a stateful fake
// of auth.users + profiles and asserts on the rows.

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL  ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-service-key';

const PROVIDER = '0f0a3c55-5d1e-4a57-9d6b-1c0f2b7f9a11';
const OTHER_PROVIDER = '1f0a3c55-5d1e-4a57-9d6b-1c0f2b7f9a11';

let staff = true;
vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve(staff
    ? { ok: true, role: 'tps_admin', userId: 'staff-1' }
    : { ok: false, response: new Response('no', { status: 403 }) }),
}));
vi.mock('@/lib/rateLimit', () => ({
  limiters: { account: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse: () => new Response('rl', { status: 429 }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/audit', () => ({ auditLog: () => {} }));
const sent: string[] = [];
vi.mock('@/lib/email', () => ({
  sendEmail: (e: { to: string }) => { sent.push(e.to); return Promise.resolve({ id: 'r' }); },
  lastEmailError: () => null,
  hsProviderInvitedEmail: (a: { to: string }) => ({ to: a.to, subject: 's', html: '' }),
}));

type Row = Record<string, any>;
let users: Map<string, string>;
let signedIn: Set<string>;
let profiles: Map<string, Row>;
let tokens: Row[];
let unbanned: string[];
let providerActive = true;
let n = 0;

function profilesTable() {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => [...profiles.values()].filter(r => filters.every(f => f(r)));
  const q: any = {
    select: () => q,
    update: (p: Row) => { patch = p; return q; },
    eq: (c: string, v: any) => { filters.push(r => r[c] === v); return q; },
    is: (c: string, v: any) => { filters.push(r => (r[c] ?? null) === v); return q; },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (res: any, rej: any) => {
      const hit = rows();
      if (patch) hit.forEach(r => Object.assign(r, patch));
      return Promise.resolve({ data: null, error: null, count: hit.length }).then(res, rej);
    },
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => {
      if (t === 'profiles') return profilesTable();
      if (t === 'profile_access_tokens') return { insert: (r: Row) => { tokens.push(r); return Promise.resolve({ error: null }); } };
      if (t === 'hs_providers') return {
        select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: () => Promise.resolve({
          data: id === PROVIDER ? { id, name: 'Lighthouse Safety', active: providerActive } : null, error: null }) }) }),
      };
      throw new Error(`unexpected table ${t}`);
    },
    rpc: (_fn: string, a: { p_email: string }) => Promise.resolve({ data: users.get(a.p_email) ?? null, error: null }),
    auth: { admin: {
      createUser: ({ email }: { email: string }) => {
        const id = `new-${++n}`;
        users.set(email, id);
        profiles.set(id, { id, email, role: 'client_user', company_id: null, hs_provider_id: null });   // handle_new_user
        return Promise.resolve({ data: { user: { id } }, error: null });
      },
      getUserById: (id: string) => Promise.resolve({ data: { user: { id, last_sign_in_at: signedIn.has(id) ? '2026-09-01' : null } }, error: null }),
      updateUserById: (id: string, a: { ban_duration?: string }) => { if (a.ban_duration === 'none') unbanned.push(id); return Promise.resolve({ error: null }); },
    } },
  }),
}));

import { POST } from '../route';

function seed(id: string, email: string, row: Row, opts: { signedIn?: boolean } = {}) {
  users.set(email, id);
  profiles.set(id, { id, email, hs_provider_id: null, ...row });
  if (opts.signedIn) signedIn.add(id);
}

async function invite(body: Row, provider = PROVIDER) {
  const res = await POST(new Request(`https://admin.thepeoplesystem.co.uk/api/admin/hs/providers/${provider}/users`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as any, { params: { id: provider } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

beforeEach(() => {
  staff = true; providerActive = true;
  users = new Map(); signedIn = new Set(); profiles = new Map(); tokens = []; unbanned = []; sent.length = 0;
  seed('staff-1', 'tom@corestaff.example', { role: 'tps_admin', company_id: null }, { signedIn: true });
  seed('client-1', 'boss@client.example', { role: 'client_admin', company_id: 'co-1' }, { signedIn: true });
});

describe('a provider invite makes a provider login and nothing else', () => {
  it('a new person becomes hs_provider with no company, linked to this provider', async () => {
    const { status } = await invite({ email: 'jo@lighthouse.example', full_name: 'Jo' });
    expect(status).toBe(200);
    const id = users.get('jo@lighthouse.example')!;
    expect(profiles.get(id)).toMatchObject({ role: 'hs_provider', company_id: null, hs_provider_id: PROVIDER, full_name: 'Jo' });
    expect(tokens.map(t => t.profile_id)).toEqual([id]);
    expect(sent).toEqual(['jo@lighthouse.example']);
  });

  it('ignores a role or company in the body', async () => {
    await invite({ email: 'sneaky@lighthouse.example', role: 'tps_admin', company_id: 'co-1', hs_provider_id: OTHER_PROVIDER });
    const id = users.get('sneaky@lighthouse.example')!;
    expect(profiles.get(id)).toMatchObject({ role: 'hs_provider', company_id: null, hs_provider_id: PROVIDER });
  });

  it('never converts a staff account', async () => {
    const { status } = await invite({ email: 'tom@corestaff.example' });
    expect(status).toBe(409);
    expect(profiles.get('staff-1')).toMatchObject({ role: 'tps_admin', hs_provider_id: null });
    expect(tokens).toEqual([]);
  });

  it('never converts a client account', async () => {
    const { status } = await invite({ email: 'boss@client.example' });
    expect(status).toBe(409);
    expect(profiles.get('client-1')).toMatchObject({ role: 'client_admin', company_id: 'co-1', hs_provider_id: null });
  });

  it("never moves another provider's live login", async () => {
    seed('p-2', 'sam@kentec.example', { role: 'hs_provider', company_id: null, hs_provider_id: OTHER_PROVIDER }, { signedIn: true });
    expect((await invite({ email: 'sam@kentec.example' })).status).toBe(409);
    expect(profiles.get('p-2')!.hs_provider_id).toBe(OTHER_PROVIDER);
  });

  it('resends to a login of this provider that has never signed in', async () => {
    seed('p-3', 'new@lighthouse.example', { role: 'hs_provider', company_id: null, hs_provider_id: PROVIDER });
    expect((await invite({ email: 'new@lighthouse.example' })).status).toBe(200);
    expect(tokens.map(t => t.profile_id)).toEqual(['p-3']);
    expect(unbanned).toEqual([]);
  });

  it('refuses to mint a link for a working login (that is a password reset, from Users)', async () => {
    seed('p-4', 'live@lighthouse.example', { role: 'hs_provider', company_id: null, hs_provider_id: PROVIDER }, { signedIn: true });
    expect((await invite({ email: 'live@lighthouse.example' })).status).toBe(409);
    expect(tokens).toEqual([]);
  });

  it('gives a revoked login access again, lifting the ban', async () => {
    seed('p-5', 'back@lighthouse.example', { role: 'hs_provider', company_id: null, hs_provider_id: null }, { signedIn: true });
    expect((await invite({ email: 'back@lighthouse.example' })).status).toBe(200);
    expect(profiles.get('p-5')!.hs_provider_id).toBe(PROVIDER);
    expect(unbanned).toEqual(['p-5']);
  });

  it('refuses a deactivated provider, and a caller who is not staff', async () => {
    providerActive = false;
    expect((await invite({ email: 'x@lighthouse.example' })).status).toBe(409);
    providerActive = true; staff = false;
    expect((await invite({ email: 'y@lighthouse.example' })).status).toBe(403);
    expect(users.has('x@lighthouse.example') || users.has('y@lighthouse.example')).toBe(false);
  });
});
