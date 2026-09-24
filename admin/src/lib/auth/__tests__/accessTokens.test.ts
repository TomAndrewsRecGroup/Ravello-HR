// Set-password tokens are stored as SHA-256 only, in a table only the
// service role can read. These drive the real helpers against a
// stateful fake of profile_access_tokens that honours the filters and
// the DELETE … RETURNING claim, so single-use is a property of the code
// under test, not of the fake.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_MS, hashAccessToken, mintAccessToken, normaliseAccessToken,
  peekAccessToken, redeemAccessToken,
} from '../accessTokens';

type Row = { token_hash: string; profile_id: string; purpose: string; expires_at: string; created_by: string | null };

function fakeService(rows: Row[] = []) {
  const table = (name: string) => {
    if (name !== 'profile_access_tokens') throw new Error(`unexpected table ${name}`);
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'delete' = 'select';
    const matching = () => rows.filter(r => filters.every(f => f(r)));
    const q: any = {
      insert: (r: Row) => { rows.push(r); return Promise.resolve({ error: null }); },
      select: () => q,
      delete: () => { op = 'delete'; return q; },
      eq: (c: keyof Row, v: string) => { filters.push(r => r[c] === v); return q; },
      gt: (c: keyof Row, v: string) => { filters.push(r => new Date(r[c] as string) > new Date(v)); return q; },
      maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
      then: (res: any, rej: any) => {
        const hit = matching();
        if (op === 'delete') hit.forEach(h => rows.splice(rows.indexOf(h), 1));
        return Promise.resolve({ data: hit, error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { rows, client: { from: table } as any };
}

const NOW = Date.parse('2026-09-24T12:00:00Z');

describe('access tokens', () => {
  it('hashes the normalised token with SHA-256, matching what 091 computes in SQL', async () => {
    const t = '0f8a3c1e-5b7d-4e2a-9c6f-1a2b3c4d5e6f';
    const want = createHash('sha256').update(t).digest('hex');   // encode(sha256(convert_to(lower(t),'UTF8')),'hex')
    expect(await hashAccessToken(t)).toBe(want);
    expect(await hashAccessToken(`  ${t.toUpperCase()} `)).toBe(want);
  });

  it('accepts only a uuid-shaped token', () => {
    expect(normaliseAccessToken(' 0F8A3C1E-5B7D-4E2A-9C6F-1A2B3C4D5E6F ')).toBe('0f8a3c1e-5b7d-4e2a-9c6f-1a2b3c4d5e6f');
    expect(normaliseAccessToken('not-a-token')).toBeNull();
    expect(normaliseAccessToken(undefined)).toBeNull();
  });

  it('stores the hash, never the token', async () => {
    const { rows, client } = fakeService();
    const minted = await mintAccessToken(client, 'p-1', 'reset', 'staff-1', NOW);
    if ('error' in minted) throw new Error(minted.error);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(minted.token);
    expect(rows[0]).toMatchObject({ profile_id: 'p-1', purpose: 'reset', token_hash: await hashAccessToken(minted.token) });
    expect(Date.parse(rows[0].expires_at) - NOW).toBe(ACCESS_TOKEN_TTL_MS);
  });

  it('is single-use, and using one link burns the account’s others', async () => {
    const { rows, client } = fakeService();
    const a = await mintAccessToken(client, 'p-1', 'invite', null, NOW) as { token: string };
    const b = await mintAccessToken(client, 'p-1', 'reset',  null, NOW) as { token: string };
    await mintAccessToken(client, 'p-2', 'invite', null, NOW);

    expect(await redeemAccessToken(client, a.token, NOW + 1000)).toEqual({ profileId: 'p-1' });
    expect(await redeemAccessToken(client, a.token, NOW + 2000)).toBeNull();   // used
    expect(await redeemAccessToken(client, b.token, NOW + 3000)).toBeNull();   // burned with it
    expect(rows.map(r => r.profile_id)).toEqual(['p-2']);                      // other accounts untouched
  });

  it('does not redeem, and peeks as expired, once past its 7 days', async () => {
    const { client } = fakeService();
    const m = await mintAccessToken(client, 'p-1', 'invite', null, NOW) as { token: string };
    const later = NOW + ACCESS_TOKEN_TTL_MS + 1;
    expect(await peekAccessToken(client, m.token, later)).toBe('expired');
    expect(await redeemAccessToken(client, m.token, later)).toBeNull();
    expect(await peekAccessToken(client, m.token, NOW)).toMatchObject({ profileId: 'p-1' });
  });
});
