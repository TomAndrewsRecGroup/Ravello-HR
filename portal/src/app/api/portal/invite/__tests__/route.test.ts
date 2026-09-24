// The portal invite route runs with the SERVICE ROLE, which 088's guard
// exempts — so this route is itself the boundary for what an invite may
// do to an account that already exists.
//
// Until 2026-09-24 it resolved an existing account by profiles.email and
// upserted the inviter's company and 'client_editor' onto it. A
// client_admin could therefore demote a Core OS 360 staff member or pull
// another client's user into their own company, just by inviting that
// email address — reproduced live by the security review. This drives
// the real POST handler against a stateful fake of auth.users + profiles
// and asserts what happened to the EXISTING row, not what was returned.

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL  ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-service-key';

const OWN_CO   = 'co-own';
const OTHER_CO = 'co-other';

vi.mock('@/lib/supabase/server', () => ({
  getSessionProfile: () => Promise.resolve({ user: { id: 'inviter' }, role: 'client_admin', companyId: OWN_CO }),
}));

const sent: string[] = [];
vi.mock('@/lib/email', () => ({
  sendEmail:        (e: { to: string }) => { sent.push(e.to); return Promise.resolve({ id: 'resend-1' }); },
  lastEmailError:   () => null,
  buildInviteEmail: (a: { to: string }) => ({ to: a.to, subject: 'invite', html: '' }),
}));

/* ── Fake auth.users + profiles ────────────────────────────────── */

type Row = Record<string, any>;
let users:    Map<string, string>;   // lower(email) → id
let profiles: Map<string, Row>;      // id → row
let nextId = 0;

function seed(id: string, email: string, row: Row) {
  users.set(email.toLowerCase(), id);
  profiles.set(id, { id, email, invite_token: null, ...row });
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
      const existing = profiles.get(row.id) ?? {};
      profiles.set(row.id, { ...existing, ...row });
      return Promise.resolve({ data: null, error: null, count: 1 });
    },
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => query(table),
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
        profiles.set(id, { id, email, role: 'client_user', company_id: null, invite_token: null }); // handle_new_user
        return Promise.resolve({ data: { user: { id } }, error: null });
      },
    } },
  }),
}));

import { POST } from '../route';

function invite(email: string) {
  return POST(new Request('https://portal.thepeoplesystem.co.uk/api/portal/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }) as any);
}

beforeEach(() => {
  users = new Map();
  profiles = new Map();
  sent.length = 0;
  seed('staff-1', 'tom@corestaff.example', { role: 'tps_admin', company_id: null });
  seed('other-1', 'someone@otherco.example', { role: 'client_admin', company_id: OTHER_CO });
});

describe('an invite never takes over an account that already exists', () => {
  it('refuses a Core OS 360 staff email and leaves the staff account untouched', async () => {
    const res = await invite('Tom@CoreStaff.example');
    expect(res.status).toBe(409);
    expect(profiles.get('staff-1')).toMatchObject({ role: 'tps_admin', company_id: null, invite_token: null });
    expect(sent).toEqual([]);
  });

  it("refuses another client's user and leaves them in their own company", async () => {
    const res = await invite('someone@otherco.example');
    expect(res.status).toBe(409);
    expect(profiles.get('other-1')).toMatchObject({ role: 'client_admin', company_id: OTHER_CO, invite_token: null });
    expect(sent).toEqual([]);
  });

  it('refuses to mint a set-password link for a colleague who already has access', async () => {
    seed('col-1', 'colleague@own.example', { role: 'client_editor', company_id: OWN_CO });
    const res = await invite('colleague@own.example');
    expect(res.status).toBe(409);
    expect(profiles.get('col-1')!.invite_token).toBeNull();
  });

  it('resends a PENDING invite in the same company, changing only the token', async () => {
    seed('pend-1', 'pending@own.example', { role: 'client_admin', company_id: OWN_CO, invite_token: 'old' });
    const res = await invite('pending@own.example');
    expect(res.status).toBe(200);
    const row = profiles.get('pend-1')!;
    expect(row.invite_token).not.toBe('old');
    expect(row).toMatchObject({ role: 'client_admin', company_id: OWN_CO });   // not demoted to editor
    expect(sent).toEqual(['pending@own.example']);
  });

  it('still creates and invites a genuinely new person', async () => {
    const res = await invite('newhire@own.example');
    expect(res.status).toBe(200);
    const id = users.get('newhire@own.example')!;
    expect(profiles.get(id)).toMatchObject({ role: 'client_editor', company_id: OWN_CO });
    expect(profiles.get(id)!.invite_token).toBeTruthy();
    expect(sent).toEqual(['newhire@own.example']);
  });
});
