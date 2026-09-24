// The staff invite route writes with the SERVICE ROLE, so 088's guard
// does not see it: this route is the boundary for what an invite may do
// to an account that already exists.
//
// Until 2026-09-24 it found an existing account by profiles.email — a
// column any signed-in user could rewrite on their own row — and
// upserted company_id + role onto whatever it found. The review
// reproduced it live: set your own profile email to a new hire's
// address, wait for staff to invite them, become that client's admin.
// This drives the real handler against a stateful fake of auth.users +
// profiles and asserts what happened to the rows.

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL  ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-service-key';

const TARGET_CO = '11111111-1111-4111-8111-111111111111';
const OTHER_CO  = '22222222-2222-4222-8222-222222222222';

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, role: 'tps_admin', userId: 'staff-actor' }),
}));
vi.mock('@/lib/rateLimit', () => ({
  limiters: { account: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: () => {} }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: TARGET_CO, name: 'Target Co' }, error: null }) }) }) }),
  }),
}));
const sent: string[] = [];
vi.mock('@/lib/email', () => ({
  sendEmail:         (e: { to: string }) => { sent.push(e.to); return Promise.resolve({ id: 'resend-1' }); },
  lastEmailError:    () => null,
  userInvitedEmail:  (a: { to: string }) => ({ to: a.to, subject: 'invite', html: '' }),
}));

/* ── Fake auth.users + profiles ────────────────────────────────── */

type Row = Record<string, any>;
let users:    Map<string, string>;   // lower(auth email) → id
let profiles: Map<string, Row>;
let nextId = 0;

function seed(id: string, email: string, row: Row) {
  users.set(email.toLowerCase(), id);
  profiles.set(id, { id, email, invite_token: null, ...row });
}

function query() {
  const filters: [string, any][] = [];
  let patch: Row | null = null;
  const rows = () => [...profiles.values()].filter(r => filters.every(([c, v]) => r[c] === v));
  const q: any = {
    select: () => q,
    eq: (c: string, v: any) => { filters.push([c, v]); return q; },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    update: (p: Row) => { patch = p; return q; },
    upsert: (row: Row) => {
      profiles.set(row.id, { ...(profiles.get(row.id) ?? {}), ...row });
      return Promise.resolve({ data: null, error: null, count: 1 });
    },
    then: (res: any, rej: any) => {
      const hit = rows();
      if (patch) hit.forEach(r => Object.assign(r, Object.fromEntries(Object.entries(patch!).filter(([, v]) => v !== undefined))));
      return Promise.resolve({ data: null, error: null, count: hit.length }).then(res, rej);
    },
  };
  return q;
}

let tokens: Row[] = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => table === 'profile_access_tokens'
      ? { insert: (r: Row) => { tokens.push(r); return Promise.resolve({ error: null }); } }
      : query(),
    rpc: (_fn: string, args: { p_email: string }) =>
      Promise.resolve({ data: users.get(args.p_email.trim().toLowerCase()) ?? null, error: null }),
    auth: { admin: {
      createUser: ({ email }: { email: string }) => {
        if (users.has(email.toLowerCase())) {
          return Promise.resolve({ data: { user: null }, error: { message: 'already registered' } });
        }
        // handle_new_user inserts profiles(id, email) and profiles_email_lower_unique
        // refuses a duplicate — which is how a squatted profile email made
        // createUser fail and sent the old code down its fallback.
        if ([...profiles.values()].some(r => String(r.email).toLowerCase() === email.toLowerCase())) {
          return Promise.resolve({ data: { user: null }, error: { message: 'Database error creating new user' } });
        }
        const id = `new-${++nextId}`;
        users.set(email.toLowerCase(), id);
        profiles.set(id, { id, email, role: 'client_user', company_id: null, invite_token: null });
        return Promise.resolve({ data: { user: { id } }, error: null });
      },
      getUserById: (id: string) => Promise.resolve({ data: { user: { id, last_sign_in_at: null } }, error: null }),
    } },
  }),
}));

import { POST } from '../route';

function invite(email: string, role = 'client_admin') {
  return POST(new Request('https://admin.thepeoplesystem.co.uk/api/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, company_id: TARGET_CO, role }),
  }) as any);
}

beforeEach(() => {
  users = new Map();
  profiles = new Map();
  tokens = [];
  sent.length = 0;
});

describe('a staff invite never takes over an account that already exists', () => {
  it('ignores a profiles.email squatted onto an attacker account', async () => {
    // The attacker rewrote THEIR profile email to the new hire's address;
    // auth.users still holds their real one.
    seed('attacker', 'attacker@evil.example', { role: 'client_user', company_id: OTHER_CO });
    profiles.get('attacker')!.email = 'newhire@target.example';

    // The invite cannot complete (the squatted row blocks the new account)
    // but it must not hand the attacker the company. 088 now stops the
    // squat itself; this is the route holding even if one existed.
    const res = await invite('newhire@target.example');
    expect(res.status).toBe(400);
    expect(profiles.get('attacker')).toMatchObject({ role: 'client_user', company_id: OTHER_CO });
    expect(tokens).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('refuses a staff email and leaves the staff account untouched', async () => {
    seed('staff-2', 'colleague@corestaff.example', { role: 'tps_admin', company_id: null });
    const res = await invite('colleague@corestaff.example');
    expect(res.status).toBe(409);
    expect(profiles.get('staff-2')).toMatchObject({ role: 'tps_admin', company_id: null });
    expect(tokens).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("refuses another client's user rather than moving them", async () => {
    seed('other-1', 'someone@otherco.example', { role: 'client_admin', company_id: OTHER_CO });
    const res = await invite('someone@otherco.example', 'client_editor');
    expect(res.status).toBe(409);
    expect(profiles.get('other-1')).toMatchObject({ role: 'client_admin', company_id: OTHER_CO });
  });

  it('re-invites someone already in the target company', async () => {
    seed('in-1', 'member@target.example', { role: 'client_editor', company_id: TARGET_CO });
    const res = await invite('member@target.example', 'client_admin');
    expect(res.status).toBe(200);
    expect(profiles.get('in-1')).toMatchObject({ role: 'client_admin', company_id: TARGET_CO });
    expect(tokens.map(t => t.profile_id)).toEqual(['in-1']);
    expect(tokens[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
