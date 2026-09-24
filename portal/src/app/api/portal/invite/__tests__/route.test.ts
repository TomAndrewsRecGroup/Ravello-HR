// The portal invite route runs with the SERVICE ROLE, which 088's guard
// exempts — so this route is itself the boundary for what an invite may
// do to an account that already exists.
//
// Until 2026-09-24 it resolved an existing account by profiles.email and
// upserted the inviter's company and 'client_editor' onto it. A
// client_admin could therefore demote a Core OS 360 staff member or pull
// another client's user into their own company just by inviting that
// email address. A second review then found that "pending invite" was
// read as "holds a token", which an ACTIVE colleague given a staff reset
// also did — so a client_admin could mint a fresh link for them and, if
// the email failed, be handed it. This drives the real POST handler
// against a stateful fake of auth.users + profiles + profile_access_tokens
// and asserts what happened to the rows, not what was returned.

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL  ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-service-key';

const OWN_CO   = 'co-own';
const OTHER_CO = 'co-other';

let live: { userId: string; email: string | null; role: string; companyId: string | null } | null;
vi.mock('@/lib/auth/liveSession', () => ({
  requireLiveSession: () => Promise.resolve(live),
}));

const sent: string[] = [];
const links: string[] = [];
let emailWorks = true;
vi.mock('@/lib/email', () => ({
  sendEmail:        (e: { to: string }) => { sent.push(e.to); return Promise.resolve(emailWorks ? { id: 'resend-1' } : null); },
  lastEmailError:   () => null,
  buildInviteEmail: (a: { to: string; activateUrl: string }) => { links.push(a.activateUrl); return { to: a.to, subject: 'invite', html: '' }; },
}));
vi.mock('@/lib/rateLimit', () => ({
  limiters: { account: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

/* ── Fake auth.users + profiles + profile_access_tokens ────────── */

type Row = Record<string, any>;
let users:    Map<string, string>;   // lower(email) → id
let signedIn: Set<string>;           // ids that have ever signed in
let profiles: Map<string, Row>;      // id → row
let tokens:   Row[];
let nextId = 0;

function seed(id: string, email: string, row: Row, opts: { signedIn?: boolean } = {}) {
  users.set(email.toLowerCase(), id);
  profiles.set(id, { id, email, ...row });
  if (opts.signedIn) signedIn.add(id);
}

function query(table: string) {
  const filters: [string, any, 'eq' | 'in'][] = [];
  let mode: 'select' | 'update' = 'select';
  let patch: Row = {};
  let head = false;
  const match = (r: Row) => filters.every(([c, v, op]) => op === 'eq' ? r[c] === v : (v as any[]).includes(r[c]));
  const rows = () => table === 'profiles' ? [...profiles.values()].filter(match) : [{ id: OWN_CO, name: 'Own Co' }];
  const run = () => {
    if (mode === 'update') {
      const hit = rows();
      hit.forEach(r => Object.assign(r, patch));
      return { data: null, error: null, count: hit.length };
    }
    return head ? { data: null, error: null, count: rows().length } : { data: rows(), error: null };
  };
  const q: any = {
    select: (_s: string, opts?: { head?: boolean }) => { head = !!opts?.head; return q; },
    eq: (c: string, v: any) => { filters.push([c, v, 'eq']); return q; },
    in: (c: string, v: any[]) => { filters.push([c, v, 'in']); return q; },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    update: (p: Row) => { mode = 'update'; patch = p; return q; },
    upsert: (row: Row) => {
      profiles.set(row.id, { ...(profiles.get(row.id) ?? {}), ...row });
      return Promise.resolve({ data: null, error: null, count: 1 });
    },
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => table === 'profile_access_tokens'
      ? { insert: (r: Row) => { tokens.push(r); return Promise.resolve({ error: null }); } }
      : query(table),
    rpc: (fn: string, args: { p_email: string }) => {
      if (fn !== 'auth_user_id_by_email') throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve({ data: users.get(args.p_email.trim().toLowerCase()) ?? null, error: null });
    },
    auth: { admin: {
      createUser: ({ email }: { email: string }) => {
        if (users.has(email.toLowerCase())) {
          return Promise.resolve({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } });
        }
        const id = `new-${++nextId}`;
        users.set(email.toLowerCase(), id);
        profiles.set(id, { id, email, role: 'client_user', company_id: null }); // handle_new_user
        return Promise.resolve({ data: { user: { id } }, error: null });
      },
      getUserById: (id: string) => Promise.resolve({
        data: { user: { id, last_sign_in_at: signedIn.has(id) ? '2026-09-01T09:00:00Z' : null } }, error: null,
      }),
    } },
  }),
}));

import { POST } from '../route';

async function invite(email: string) {
  const res = await POST(new Request('https://portal.thepeoplesystem.co.uk/api/portal/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }) as any);
  return { status: res.status, body: await res.json() };
}

const tokensFor = (id: string) => tokens.filter(t => t.profile_id === id);

beforeEach(() => {
  live = { userId: 'inviter', email: 'inviter@own.example', role: 'client_admin', companyId: OWN_CO };
  users = new Map();
  signedIn = new Set();
  profiles = new Map();
  tokens = [];
  sent.length = 0;
  links.length = 0;
  emailWorks = true;
  seed('staff-1', 'tom@corestaff.example', { role: 'tps_admin', company_id: null }, { signedIn: true });
  seed('other-1', 'someone@otherco.example', { role: 'client_admin', company_id: OTHER_CO }, { signedIn: true });
});

describe('an invite never takes over an account that already exists', () => {
  it('refuses a Core OS 360 staff email and leaves the staff account untouched', async () => {
    const { status } = await invite('Tom@CoreStaff.example');
    expect(status).toBe(409);
    expect(profiles.get('staff-1')).toMatchObject({ role: 'tps_admin', company_id: null });
    expect(tokensFor('staff-1')).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("refuses another client's user and leaves them in their own company", async () => {
    const { status } = await invite('someone@otherco.example');
    expect(status).toBe(409);
    expect(profiles.get('other-1')).toMatchObject({ role: 'client_admin', company_id: OTHER_CO });
    expect(tokensFor('other-1')).toEqual([]);
  });

  it('refuses a colleague who has signed in — even one holding a live staff reset', async () => {
    seed('col-1', 'colleague@own.example', { role: 'client_editor', company_id: OWN_CO }, { signedIn: true });
    tokens.push({ profile_id: 'col-1', purpose: 'reset', token_hash: 'x'.repeat(64) });
    const { status } = await invite('colleague@own.example');
    expect(status).toBe(409);
    expect(tokensFor('col-1')).toHaveLength(1);   // nothing new minted
  });

  it('resends to someone who has never signed in, without touching their profile', async () => {
    seed('pend-1', 'pending@own.example', { role: 'client_admin', company_id: OWN_CO });
    const { status } = await invite('pending@own.example');
    expect(status).toBe(200);
    expect(profiles.get('pend-1')).toMatchObject({ role: 'client_admin', company_id: OWN_CO });   // not demoted
    expect(tokensFor('pend-1')).toHaveLength(1);
    expect(sent).toEqual(['pending@own.example']);
  });

  it('never hands a client inviter a set-password link, even when the email fails', async () => {
    emailWorks = false;
    const fresh = await invite('newhire@own.example');
    expect(fresh.status).toBe(502);
    expect(JSON.stringify(fresh.body)).not.toMatch(/set-password|token=/);

    seed('pend-1', 'pending@own.example', { role: 'client_editor', company_id: OWN_CO });
    const resend = await invite('pending@own.example');
    expect(resend.status).toBe(502);
    expect(JSON.stringify(resend.body)).not.toMatch(/set-password|token=/);
  });

  it('a failed send can simply be retried: the retry takes the resend path', async () => {
    emailWorks = false;
    expect((await invite('newhire@own.example')).status).toBe(502);
    emailWorks = true;
    expect((await invite('newhire@own.example')).status).toBe(200);
    expect(sent).toEqual(['newhire@own.example', 'newhire@own.example']);
  });

  it('creates and invites a genuinely new person, storing only a hash of the link', async () => {
    const { status } = await invite('newhire@own.example');
    expect(status).toBe(200);
    const id = users.get('newhire@own.example')!;
    expect(profiles.get(id)).toMatchObject({ role: 'client_editor', company_id: OWN_CO });
    const [t] = tokensFor(id);
    expect(t.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const raw = new URL(links[0]).searchParams.get('token')!;
    expect(JSON.stringify(tokens)).not.toContain(raw);
  });
});

describe('who may invite is checked live, not from the session cookie', () => {
  it('refuses a caller with no live Supabase session', async () => {
    live = null;
    const { status } = await invite('newhire@own.example');
    expect(status).toBe(401);
    expect(users.has('newhire@own.example')).toBe(false);
  });

  it('refuses a caller who is no longer a client_admin', async () => {
    live = { userId: 'inviter', email: null, role: 'client_editor', companyId: OWN_CO };
    const { status } = await invite('newhire@own.example');
    expect(status).toBe(403);
    expect(users.has('newhire@own.example')).toBe(false);
  });
});

describe('a refusal tells the inviter nothing about whose address it is', () => {
  it('gives staff, another client and an active colleague the same answer', async () => {
    seed('col-1', 'colleague@own.example', { role: 'client_editor', company_id: OWN_CO }, { signedIn: true });
    const answers = await Promise.all(
      ['tom@corestaff.example', 'someone@otherco.example', 'colleague@own.example'].map(invite),
    );
    expect(new Set(answers.map(a => JSON.stringify(a)))).toEqual(new Set([JSON.stringify(answers[0])]));
    expect(answers[0].status).toBe(409);
  });

  it('at the seat cap, an existing outside address and an unknown one look the same', async () => {
    seed('a-1', 'a@own.example', { role: 'client_admin', company_id: OWN_CO }, { signedIn: true });
    seed('a-2', 'b@own.example', { role: 'client_editor', company_id: OWN_CO }, { signedIn: true });
    const outside = await invite('someone@otherco.example');
    const unknown = await invite('nobody@nowhere.example');
    expect(outside).toEqual(unknown);
    expect(unknown.body.code).toBe('seat_cap_reached');
  });
});
