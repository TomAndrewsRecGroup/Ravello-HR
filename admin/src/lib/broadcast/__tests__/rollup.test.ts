import { describe, expect, it } from 'vitest';
import { groupBroadcastActions, type BroadcastActionRow } from '../rollup';

// Core-OS 360 Completion Programme, Phase 25, Group 6 (C17.7).

function row(over: Partial<BroadcastActionRow> & { id: string }): BroadcastActionRow {
  return {
    title: 'New policy', description: null, action_type: 'compliance', priority: 'normal',
    due_date: null, created_at: '2026-09-30T10:00:00.000Z', company_id: 'co-1', status: 'active',
    source_type: null, source_id: null, companies: { id: 'co-1', slug: 'co-1', name: 'Company One' },
    ...over,
  };
}

describe('groupBroadcastActions', () => {
  it('groups rows sharing a source_id into one bucket, regardless of differing per-company data', () => {
    const buckets = groupBroadcastActions([
      row({ id: 'a1', source_type: 'regulatory_broadcast', source_id: 'send-1', company_id: 'co-1', companies: { id: 'co-1', slug: null, name: 'A' } }),
      row({ id: 'a2', source_type: 'regulatory_broadcast', source_id: 'send-1', company_id: 'co-2', companies: { id: 'co-2', slug: null, name: 'B' } }),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].companies.map(c => c.id).sort()).toEqual(['co-1', 'co-2']);
    expect(buckets[0].total).toBe(2);
    expect(buckets[0].regulatory).toBe(true);
  });

  it('falls back to the title|description|timestamp heuristic when source_id is absent — an ordinary hand-typed broadcast', () => {
    const buckets = groupBroadcastActions([
      row({ id: 'a1', title: 'Hand typed', created_at: '2026-09-30T10:00:00.123Z', company_id: 'co-1' }),
      row({ id: 'a2', title: 'Hand typed', created_at: '2026-09-30T10:00:00.456Z', company_id: 'co-2', companies: { id: 'co-2', slug: null, name: 'B' } }),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].regulatory).toBe(false);
    expect(buckets[0].total).toBe(2);
  });

  it('never merges two DIFFERENT sends sharing the same title — distinct source_ids stay distinct buckets', () => {
    const buckets = groupBroadcastActions([
      row({ id: 'a1', title: 'Same title', source_type: 'regulatory_broadcast', source_id: 'send-1' }),
      row({ id: 'a2', title: 'Same title', source_type: 'regulatory_broadcast', source_id: 'send-2' }),
    ]);
    expect(buckets).toHaveLength(2);
  });

  it('counts completion correctly — only status "complete" counts, and a bucket can be partially complete', () => {
    const buckets = groupBroadcastActions([
      row({ id: 'a1', source_id: 'send-1', status: 'complete' }),
      row({ id: 'a2', source_id: 'send-1', status: 'active' }),
      row({ id: 'a3', source_id: 'send-1', status: 'in_progress' }),
    ]);
    expect(buckets[0]).toMatchObject({ total: 3, complete: 1 });
  });

  it('a bucket with no source_type is never flagged regulatory, even if some OTHER bucket is', () => {
    const buckets = groupBroadcastActions([
      row({ id: 'a1', source_type: 'regulatory_broadcast', source_id: 'send-1' }),
      row({ id: 'a2', title: 'Unrelated hand-typed', created_at: '2026-09-29T09:00:00Z' }),
    ]);
    const regulatory = buckets.find(b => b.key === 's:send-1')!;
    const handTyped = buckets.find(b => b.key !== 's:send-1')!;
    expect(regulatory.regulatory).toBe(true);
    expect(handTyped.regulatory).toBe(false);
  });

  it('counts acknowledgement from the supplied id set, independently of completion status', () => {
    const buckets = groupBroadcastActions(
      [
        row({ id: 'a1', source_id: 'send-1', status: 'active' }),
        row({ id: 'a2', source_id: 'send-1', status: 'complete' }),
        row({ id: 'a3', source_id: 'send-1', status: 'active' }),
      ],
      new Set(['a1', 'a2']),
    );
    expect(buckets[0]).toMatchObject({ total: 3, complete: 1, acknowledged: 2 });
  });

  it('acknowledged is zero when no id set is supplied at all', () => {
    const buckets = groupBroadcastActions([row({ id: 'a1', source_id: 'send-1' })]);
    expect(buckets[0].acknowledged).toBe(0);
  });

  it('normalises the companies embed whether PostgREST returns an array or a single object', () => {
    const buckets = groupBroadcastActions([
      row({ id: 'a1', source_id: 'send-1', companies: [{ id: 'co-1', slug: null, name: 'Array shape' }] }),
      row({ id: 'a2', source_id: 'send-1', companies: { id: 'co-2', slug: null, name: 'Object shape' } }),
    ]);
    expect(buckets[0].companies.map(c => c.name).sort()).toEqual(['Array shape', 'Object shape']);
  });
});
