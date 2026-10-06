// document_signature_tokens is SHA-256 only, in a table only the
// service role can read. These drive the real helpers against a
// stateful fake that honours the filters and the DELETE, so
// single-use (and "burns every link for this instance") is a property
// of the code under test, not of the fake — the accessTokens.test.ts
// precedent.

import { describe, expect, it } from 'vitest';
import { hashAccessToken } from '@/lib/auth/accessTokens';
import { mintSignatureToken, peekSignatureToken, burnSignatureTokens } from '../signatureTokens';

type Row = { token_hash: string; document_instance_id: string; expires_at: string };

function fakeService(rows: Row[] = []) {
  const table = (name: string) => {
    if (name !== 'document_signature_tokens') throw new Error(`unexpected table ${name}`);
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'delete' = 'select';
    const matching = () => rows.filter(r => filters.every(f => f(r)));
    const q: any = {
      insert: (r: Row) => { rows.push(r); return Promise.resolve({ error: null }); },
      select: () => q,
      delete: () => { op = 'delete'; return q; },
      eq: (c: keyof Row, v: string) => { filters.push(r => r[c] === v); return q; },
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

const NOW = Date.parse('2026-10-06T12:00:00Z');

describe('document signature tokens', () => {
  it('stores the hash, never the raw token', async () => {
    const { rows, client } = fakeService();
    const minted = await mintSignatureToken(client, 'inst-1', NOW);
    if ('error' in minted) throw new Error(minted.error);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(minted.token);
    expect(rows[0]).toMatchObject({ document_instance_id: 'inst-1', token_hash: await hashAccessToken(minted.token) });
  });

  it('peeks a valid token without consuming it', async () => {
    const { client } = fakeService();
    const m = await mintSignatureToken(client, 'inst-1', NOW) as { token: string };
    expect(await peekSignatureToken(client, m.token, NOW)).toEqual({ documentInstanceId: 'inst-1' });
    // peeking again still finds it — it is not burned by a peek
    expect(await peekSignatureToken(client, m.token, NOW)).toEqual({ documentInstanceId: 'inst-1' });
  });

  it('reports expired once past its 30-day window, and null for an unknown token', async () => {
    const { client } = fakeService();
    const m = await mintSignatureToken(client, 'inst-1', NOW) as { token: string };
    const later = NOW + 30 * 24 * 60 * 60 * 1000 + 1;
    expect(await peekSignatureToken(client, m.token, later)).toBe('expired');
    expect(await peekSignatureToken(client, 'not-a-real-token', NOW)).toBeNull();
  });

  it('burning an instance’s tokens removes every one of its own links but leaves another instance’s untouched', async () => {
    const { rows, client } = fakeService();
    const a = await mintSignatureToken(client, 'inst-1', NOW) as { token: string };
    const b = await mintSignatureToken(client, 'inst-1', NOW) as { token: string }; // a resend, second live link
    const c = await mintSignatureToken(client, 'inst-2', NOW) as { token: string };

    await burnSignatureTokens(client, 'inst-1');

    expect(await peekSignatureToken(client, a.token, NOW)).toBeNull();
    expect(await peekSignatureToken(client, b.token, NOW)).toBeNull();
    expect(await peekSignatureToken(client, c.token, NOW)).toEqual({ documentInstanceId: 'inst-2' });
    expect(rows.map(r => r.document_instance_id)).toEqual(['inst-2']);
  });
});
