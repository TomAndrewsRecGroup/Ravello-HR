import { describe, it, expect } from 'vitest';
import { mintEntityQrToken, revokeEntityQrToken, hasActiveEntityQrToken, entityQrUrl } from '../qrTokens';

// The exact workforce/qrTokens.test.ts fake-service shape, keyed on
// (entity_type, entity_id) instead of person_id — enough to exercise
// mint/revoke/peek without a live database.
interface Row { id: string; entity_type: string; entity_id: string; token_hash: string; revoked_at: string | null; revoked_by: string | null; created_by: string | null }

function fakeService(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  let nextId = 1;
  const client = {
    from(name: string) {
      if (name !== 'entity_qr_tokens') throw new Error(`unexpected table ${name}`);
      return {
        update(patch: Partial<Row>, _opts?: { count?: string }) {
          const filters: Array<(r: Row) => boolean> = [];
          const q = {
            eq(col: keyof Row, v: unknown) { filters.push(r => r[col] === v); return q; },
            is(col: keyof Row, v: unknown) { filters.push(r => (v === null ? r[col] == null : r[col] === v)); return q; },
            then(resolve: any) {
              const hit = rows.filter(r => filters.every(f => f(r)));
              hit.forEach(r => Object.assign(r, patch));
              return Promise.resolve({ error: null, count: hit.length }).then(resolve);
            },
          };
          return q;
        },
        insert(payload: Partial<Row>) {
          return {
            then(resolve: any) {
              if (payload.token_hash && rows.some(r => r.token_hash === payload.token_hash)) {
                return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint' } }).then(resolve);
              }
              if (rows.some(r => r.entity_type === payload.entity_type && r.entity_id === payload.entity_id && r.revoked_at == null)) {
                return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint (entity_qr_tokens_one_active)' } }).then(resolve);
              }
              rows.push({
                id: `row-${nextId++}`, entity_type: payload.entity_type!, entity_id: payload.entity_id!,
                token_hash: payload.token_hash!, revoked_at: null, revoked_by: null, created_by: payload.created_by ?? null,
              });
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

const EQUIPMENT_ID = 'asset-1';

describe('mintEntityQrToken', () => {
  it('mints a label for an entity with none yet', async () => {
    const { client, rows } = fakeService();
    const res = await mintEntityQrToken(client as any, 'equipment', EQUIPMENT_ID, 'staff-1');
    expect('error' in res).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at).toBeNull();
  });

  it('revokes the OLD active label before minting a new one — never two active at once', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', entity_type: 'equipment', entity_id: EQUIPMENT_ID, token_hash: 'a'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    const res = await mintEntityQrToken(client as any, 'equipment', EQUIPMENT_ID, 'staff-1');
    expect('error' in res).toBe(false);
    const active = rows.filter(r => r.entity_id === EQUIPMENT_ID && r.revoked_at == null);
    expect(active).toHaveLength(1);
    expect(rows.find(r => r.token_hash === 'a'.repeat(64))?.revoked_at).not.toBeNull();
  });

  it('a different entity is unaffected by minting for this one', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', entity_type: 'equipment', entity_id: 'someone-else', token_hash: 'b'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    await mintEntityQrToken(client as any, 'equipment', EQUIPMENT_ID, 'staff-1');
    expect(rows.find(r => r.entity_id === 'someone-else')?.revoked_at).toBeNull();
  });

  it('the same id under a DIFFERENT entity_type is a separate row, not a collision', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', entity_type: 'coshh_assessment', entity_id: EQUIPMENT_ID, token_hash: 'c'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    const res = await mintEntityQrToken(client as any, 'equipment', EQUIPMENT_ID, 'staff-1');
    expect('error' in res).toBe(false);
    expect(rows.find(r => r.entity_type === 'coshh_assessment')?.revoked_at).toBeNull();
    expect(rows.filter(r => r.entity_id === EQUIPMENT_ID && r.revoked_at == null)).toHaveLength(2);
  });
});

describe('revokeEntityQrToken', () => {
  it('revokes the active label and reports it', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', entity_type: 'equipment', entity_id: EQUIPMENT_ID, token_hash: 'a'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    const res = await revokeEntityQrToken(client as any, 'equipment', EQUIPMENT_ID, 'staff-1');
    expect(res).toEqual({ revoked: true });
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it('is idempotent — revoking with nothing active reports false, not an error', async () => {
    const { client } = fakeService();
    const res = await revokeEntityQrToken(client as any, 'equipment', EQUIPMENT_ID, 'staff-1');
    expect(res).toEqual({ revoked: false });
  });
});

describe('hasActiveEntityQrToken', () => {
  it('is true with an active label, false once revoked', async () => {
    const { client, rows } = fakeService([
      { id: 'row-0', entity_type: 'equipment', entity_id: EQUIPMENT_ID, token_hash: 'a'.repeat(64), revoked_at: null, revoked_by: null, created_by: null },
    ]);
    expect(await hasActiveEntityQrToken(client as any, 'equipment', EQUIPMENT_ID)).toBe(true);
    rows[0].revoked_at = new Date().toISOString();
    expect(await hasActiveEntityQrToken(client as any, 'equipment', EQUIPMENT_ID)).toBe(false);
  });
});

describe('entityQrUrl', () => {
  it('builds an absolute URL under the configured portal host', () => {
    expect(entityQrUrl('abc-123')).toMatch(/^https:\/\/.+\/e\/abc-123$/);
  });
});
