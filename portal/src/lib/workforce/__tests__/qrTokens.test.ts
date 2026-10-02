import { describe, it, expect, beforeEach } from 'vitest';
import { mintWorkerQrToken, revokeWorkerQrToken, hasActiveWorkerQrToken, workerQrUrl } from '../qrTokens';

// A minimal in-memory stand-in for the service-role client — enough to
// exercise mint/revoke/peek without a live database. Mirrors the real
// worker_qr_tokens shape closely enough that "revoke then insert"
// ordering and the active/revoked distinction are genuinely exercised.
interface Row { id: string; person_id: string; token_hash: string; revoked_at: string | null; revoked_by: string | null; created_by: string | null }

function fakeService(seed: Row[] = [], opts: { onUpdateResolved?: () => void } = {}) {
  const rows: Row[] = [...seed];
  let nextId = 1;
  const client = {
    from(name: string) {
      if (name !== 'worker_qr_tokens') throw new Error(`unexpected table ${name}`);
      return {
        update(patch: Partial<Row>, _opts?: { count?: string }) {
          const filters: Array<(r: Row) => boolean> = [];
          const q = {
            eq(col: keyof Row, v: unknown) { filters.push(r => r[col] === v); return q; },
            is(col: keyof Row, v: unknown) { filters.push(r => (v === null ? r[col] == null : r[col] === v)); return q; },
            then(resolve: any) {
              const hit = rows.filter(r => filters.every(f => f(r)));
              hit.forEach(r => Object.assign(r, patch));
              // Lets a test simulate a genuinely concurrent request's own
              // revoke+insert completing in the gap between THIS revoke
              // and the insert that follows it — the real race this file
              // exists to guard against, since the two statements are not
              // one transaction.
              opts.onUpdateResolved?.();
              return Promise.resolve({ error: null, count: hit.length }).then(resolve);
            },
          };
          return q;
        },
        insert(payload: Partial<Row>) {
          return {
            then(resolve: any) {
              if (payload.token_hash && rows.some(r => r.token_hash === payload.token_hash)) {
                return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint', code: '23505' } }).then(resolve);
              }
              if (rows.some(r => r.person_id === payload.person_id && r.revoked_at == null)) {
                return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint "worker_qr_tokens_one_active_per_person"', code: '23505' } }).then(resolve);
              }
              rows.push({ id: `row-${nextId++}`, person_id: payload.person_id!, token_hash: payload.token_hash!, revoked_at: null, revoked_by: null, created_by: payload.created_by ?? null });
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
        },
        select(_cols: string) {
          const filters: Array<(r: Row) => boolean> = [];
          const q = {
            eq(col: keyof Row, v: unknown) { filters.push(r => r[col] === v); return q; },
            is(col: keyof Row, v: unknown) { filters.push(r => (v === null ? r[col] == null : r[col] === v)); return q; },
            maybeSingle() {
              const hit = rows.filter(r => filters.every(f => f(r)))[0] ?? null;
              return Promise.resolve({ data: hit, error: null });
            },
          };
          return q;
        },
      };
    },
  };
  return { client, rows };
}

const PERSON = 'person-1';

describe('mintWorkerQrToken', () => {
  it('mints a badge for a person with none yet', async () => {
    const { client, rows } = fakeService();
    const res = await mintWorkerQrToken(client as any, PERSON, 'staff-1');
    expect('error' in res).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at).toBeNull();
  });

  it('revokes the OLD active badge before minting a new one — never two active at once', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', person_id: PERSON, token_hash: 'a'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    const res = await mintWorkerQrToken(client as any, PERSON, 'staff-1');
    expect('error' in res).toBe(false);
    const active = rows.filter(r => r.person_id === PERSON && r.revoked_at == null);
    expect(active).toHaveLength(1);
    expect(rows.find(r => r.token_hash === 'a'.repeat(64))?.revoked_at).not.toBeNull();
  });

  it('a different person is unaffected by minting for this one', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', person_id: 'someone-else', token_hash: 'b'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    await mintWorkerQrToken(client as any, PERSON, 'staff-1');
    expect(rows.find(r => r.person_id === 'someone-else')?.revoked_at).toBeNull();
  });

  it('a double-click/concurrent regenerate race returns a friendly message, never the raw Postgres error', async () => {
    // The revoke and the insert are two separate statements, not one
    // transaction (documented in qrTokens.ts) — simulate a SECOND,
    // genuinely concurrent request's own revoke+insert completing in
    // the gap right after THIS request's own revoke runs, so this
    // request's insert then collides with the partial unique index.
    const { client, rows } = fakeService(
      [{ id: 'row-0', person_id: PERSON, token_hash: 'a'.repeat(64), revoked_at: null, revoked_by: null, created_by: null }],
      {
        onUpdateResolved() {
          rows.push({ id: 'row-concurrent', person_id: PERSON, token_hash: 'c'.repeat(64), revoked_at: null, revoked_by: null, created_by: 'other-session' });
        },
      },
    );
    const res = await mintWorkerQrToken(client as any, PERSON, 'staff-1');
    expect(res).toEqual({
      error: 'Another request already generated a new badge for this person. Refresh the page to see it.',
    });
    // The error message is a string a person reads — it must never be
    // the raw constraint-violation text from Postgres.
    expect('error' in res && res.error).not.toMatch(/constraint|duplicate key/i);
    // The concurrent request's own badge is left standing, untouched.
    expect(rows.find(r => r.id === 'row-concurrent')?.revoked_at).toBeNull();
  });
});

describe('revokeWorkerQrToken', () => {
  it('revokes the active badge and reports it', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', person_id: PERSON, token_hash: 'a'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    const res = await revokeWorkerQrToken(client as any, PERSON, 'staff-1');
    expect(res).toEqual({ revoked: true });
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it('is idempotent — revoking with nothing active reports false, not an error', async () => {
    const { client } = fakeService();
    const res = await revokeWorkerQrToken(client as any, PERSON, 'staff-1');
    expect(res).toEqual({ revoked: false });
  });
});

describe('hasActiveWorkerQrToken', () => {
  it('is true with an active badge, false once revoked', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', person_id: PERSON, token_hash: 'a'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    expect(await hasActiveWorkerQrToken(client as any, PERSON)).toBe(true);
    rows[0].revoked_at = new Date().toISOString();
    expect(await hasActiveWorkerQrToken(client as any, PERSON)).toBe(false);
  });
});

describe('workerQrUrl', () => {
  it('builds an absolute URL under the configured portal host', () => {
    expect(workerQrUrl('abc-123')).toMatch(/^https:\/\/.+\/w\/abc-123$/);
  });
});
