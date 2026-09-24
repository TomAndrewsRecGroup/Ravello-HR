// /api/auth/set-password is public and runs with the service role: the
// token IS the authorisation, so what it accepts is the whole boundary.
// Tokens are stored as SHA-256 in profile_access_tokens (091); this
// drives the real handler against a fake that honours the delete-claim,
// and asserts on the password that actually got set.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashAccessToken } from '@/lib/auth/accessTokens';

process.env.NEXT_PUBLIC_SUPABASE_URL  ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-service-key';

type Row = Record<string, any>;
let tokens: Row[];
const passwordsSet: { id: string; password: string }[] = [];

function tokenTable() {
  const filters: ((r: Row) => boolean)[] = [];
  let del = false;
  const hit = () => tokens.filter(r => filters.every(f => f(r)));
  const q: any = {
    delete: () => { del = true; return q; },
    select: () => q,
    eq: (c: string, v: any) => { filters.push(r => r[c] === v); return q; },
    gt: (c: string, v: string) => { filters.push(r => new Date(r[c]) > new Date(v)); return q; },
    then: (res: any, rej: any) => {
      const rows = hit();
      if (del) tokens = tokens.filter(r => !rows.includes(r));
      return Promise.resolve({ data: rows, error: null }).then(res, rej);
    },
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => table === 'profile_access_tokens' ? tokenTable() : ({
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: { id, email: `${id}@example.com` }, error: null }) }) }),
    }),
    auth: { admin: {
      updateUserById: (id: string, attrs: { password: string }) => { passwordsSet.push({ id, password: attrs.password }); return Promise.resolve({ error: null }); },
    } },
  }),
}));

import { POST } from '../route';

const TOKEN = '0f8a3c1e-5b7d-4e2a-9c6f-1a2b3c4d5e6f';

function submit(token: string, password = 'correct horse battery') {
  return POST(new Request('https://portal.thepeoplesystem.co.uk/api/auth/set-password', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, password }),
  }) as any);
}

beforeEach(async () => {
  passwordsSet.length = 0;
  tokens = [
    { token_hash: await hashAccessToken(TOKEN), profile_id: 'p-1', expires_at: new Date(Date.now() + 86_400_000).toISOString() },
    { token_hash: 'a'.repeat(64), profile_id: 'p-1', expires_at: new Date(Date.now() + 86_400_000).toISOString() },
  ];
});

describe('set-password', () => {
  it('sets the password for the account the token belongs to, once', async () => {
    const first = await submit(TOKEN);
    expect(first.status).toBe(200);
    expect(passwordsSet).toEqual([{ id: 'p-1', password: 'correct horse battery' }]);

    const again = await submit(TOKEN, 'attacker chosen');
    expect(again.status).toBe(410);
    expect(passwordsSet).toHaveLength(1);
    expect(tokens).toEqual([]);   // the account's other outstanding link is burned too
  });

  it('accepts the token in any case, as it may be retyped from an email', async () => {
    expect((await submit(TOKEN.toUpperCase())).status).toBe(200);
  });

  it('refuses an expired token', async () => {
    tokens[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await submit(TOKEN)).status).toBe(410);
    expect(passwordsSet).toEqual([]);
  });

  it('refuses the stored HASH presented as if it were the token', async () => {
    const res = await submit(tokens[0].token_hash);
    expect(res.status).toBe(400);
    expect(passwordsSet).toEqual([]);
  });

  it('refuses a token nobody issued', async () => {
    expect((await submit('11111111-2222-4333-8444-555555555555')).status).toBe(410);
    expect(passwordsSet).toEqual([]);
  });
});
