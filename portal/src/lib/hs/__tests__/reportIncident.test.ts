import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertIncidentOnce } from '../reportIncident';

// A fake hs_incidents with a real primary key. `loseReply` makes the
// next insert COMMIT and then fail in transit — the network failure the
// spec (QA 31) asks about: the row exists, the client heard an error.

type Row = { id: string; incident_number: string; [k: string]: unknown };

function fakeDb(opts: { loseReply?: boolean; failFirst?: boolean } = {}) {
  const rows: Row[] = [];
  let loseReply = !!opts.loseReply;
  let failFirst = !!opts.failFirst;
  const sb = {
    from() {
      let payload: Row | null = null; let byId: string | null = null;
      const q: any = {
        insert(r: Row) { payload = r; return q; },
        select() { return q; },
        eq(_c: string, v: string) { byId = v; return q; },
        single() { return q; },
        maybeSingle() { return q; },
        then(res: any, rej?: any) {
          return Promise.resolve().then(() => {
            if (payload) {
              if (failFirst) { failFirst = false; return { data: null, error: { code: '08006', message: 'network down' } }; }
              if (rows.some(r => r.id === payload!.id)) {
                return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "hs_incidents_pkey"' } };
              }
              const row = { ...payload, incident_number: `INC-2026-${String(rows.length + 1).padStart(6, '0')}` };
              rows.push(row);
              if (loseReply) { loseReply = false; return { data: null, error: { code: '', message: 'Failed to fetch' } }; }
              return { data: { id: row.id, incident_number: row.incident_number }, error: null };
            }
            const hit = rows.find(r => r.id === byId);
            return { data: hit ? { id: hit.id, incident_number: hit.incident_number } : null, error: null };
          }).then(res, rej);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { sb, rows };
}

const ROW = { company_id: 'c1', incident_type: 'near_miss', title: 'Slip by the dock', description: 'x', occurred_on: '2026-09-28' };

describe('insertIncidentOnce', () => {
  it('saves a report once on a clean connection', async () => {
    const { sb, rows } = fakeDb();
    const r = await insertIncidentOnce(sb, 'id-1', ROW);
    expect(r).toMatchObject({ error: null, recovered: false, data: { id: 'id-1', incident_number: 'INC-2026-000001' } });
    expect(rows).toHaveLength(1);
  });

  it('a retry after a lost reply finds the saved report instead of filing a second one', async () => {
    const { sb, rows } = fakeDb({ loseReply: true });
    const first = await insertIncidentOnce(sb, 'id-1', ROW);
    expect(first.error).toBeTruthy();          // the reporter was told it failed …
    expect(rows).toHaveLength(1);              // … though the row committed
    const retry = await insertIncidentOnce(sb, 'id-1', ROW);
    expect(retry).toMatchObject({ error: null, recovered: true, data: { id: 'id-1', incident_number: 'INC-2026-000001' } });
    expect(rows).toHaveLength(1);              // still one incident
  });

  it('a real failure is reported, never claimed as success, and the retry then saves', async () => {
    const { sb, rows } = fakeDb({ failFirst: true });
    const first = await insertIncidentOnce(sb, 'id-1', ROW);
    expect(first).toMatchObject({ data: null, error: 'network down' });
    expect(rows).toHaveLength(0);
    const retry = await insertIncidentOnce(sb, 'id-1', ROW);
    expect(retry).toMatchObject({ error: null, recovered: false });
    expect(rows).toHaveLength(1);
  });

  it('a 23505 on a row it cannot read back is still an error', async () => {
    const { sb, rows } = fakeDb();
    rows.push({ id: 'someone-else', incident_number: 'INC-2026-000001' });
    const sbNoRead = {
      from() {
        const inner = sb.from('hs_incidents') as any;
        return { ...inner,
          insert() { return { select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate incident number' } }) }) }; },
        };
      },
    } as unknown as SupabaseClient;
    const r = await insertIncidentOnce(sbNoRead, 'id-9', ROW);
    expect(r).toMatchObject({ data: null, error: 'duplicate incident number', recovered: false });
  });
});
