import { describe, expect, it } from 'vitest';
import { resolveEntityLabels, hrefForEntity } from '../entityLabels';

// A minimal fake matching exactly the call shape this module uses:
// supabase.from(table).select(cols).in('id', ids) -> { data }. Keyed
// by table name to a row-returning function, the same narrow-fake
// precedent pipelineIdempotency.test.ts already established for a
// query shape the shared fakeSupabase harness doesn't cover.
function fakeSupabase(tables: Record<string, (ids: string[]) => unknown[]>) {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            in(_col: string, ids: string[]) {
              return Promise.resolve({ data: (tables[table] ?? (() => []))(ids) });
            },
          };
        },
      };
    },
  } as any;
}

describe('resolveEntityLabels', () => {
  it('resolves a simple curated type from its own title column', async () => {
    const supabase = fakeSupabase({
      hazards: ids => ids.map(id => ({ id, title: `Hazard ${id}` })),
    });
    const labels = await resolveEntityLabels(supabase, [{ entity_type: 'hazard', entity_id: 'h1' }]);
    expect(labels.get('hazard:h1')).toBe('Hazard h1');
  });

  it('batches one query per distinct type present, not per branch', async () => {
    let hazardCalls = 0;
    let contractorCalls = 0;
    const supabase = fakeSupabase({
      hazards: ids => { hazardCalls++; return ids.map(id => ({ id, title: `H ${id}` })); },
      contractors: ids => { contractorCalls++; return ids.map(id => ({ id, name: `C ${id}` })); },
    });
    await resolveEntityLabels(supabase, [
      { entity_type: 'hazard', entity_id: 'h1' },
      { entity_type: 'hazard', entity_id: 'h2' },
      { entity_type: 'contractor', entity_id: 'c1' },
    ]);
    expect(hazardCalls).toBe(1);
    expect(contractorCalls).toBe(1);
  });

  it('falls back to a humanised type + truncated id for an uncurated type', async () => {
    const supabase = fakeSupabase({});
    const labels = await resolveEntityLabels(supabase, [{ entity_type: 'isolation', entity_id: 'iso-1234567890' }]);
    expect(labels.get('isolation:iso-1234567890')).toBe('Isolation iso-1234…');
  });

  it('falls back when the curated column comes back blank', async () => {
    const supabase = fakeSupabase({
      hazards: ids => ids.map(id => ({ id, title: '' })),
    });
    const labels = await resolveEntityLabels(supabase, [{ entity_type: 'hazard', entity_id: 'h1' }]);
    expect(labels.get('hazard:h1')).toBe('Hazard h1…');
  });

  it('resolves legal_obligation via its legal_requirement_id join, never a direct column', async () => {
    const supabase = fakeSupabase({
      organisation_legal_obligations: ids => ids.map(id => ({ id, legal_requirement_id: 'req-1' })),
      legal_requirements: () => [{ id: 'req-1', title: 'Fire Safety Order 2005' }],
    });
    const labels = await resolveEntityLabels(supabase, [{ entity_type: 'legal_obligation', entity_id: 'lo1' }]);
    expect(labels.get('legal_obligation:lo1')).toBe('Fire Safety Order 2005');
  });

  it('resolves incident from its type + occurred_on, since hs_incidents has no title column', async () => {
    const supabase = fakeSupabase({
      hs_incidents: ids => ids.map(id => ({ id, incident_type: 'near_miss', occurred_on: '2026-01-01' })),
    });
    const labels = await resolveEntityLabels(supabase, [{ entity_type: 'incident', entity_id: 'i1' }]);
    expect(labels.get('incident:i1')).toBe('Near miss — 2026-01-01');
  });

  it('never throws when a query rejects — falls back for that type only', async () => {
    const supabase = {
      from(table: string) {
        return {
          select() {
            return { in: () => (table === 'hazards' ? Promise.reject(new Error('boom')) : Promise.resolve({ data: [] })) };
          },
        };
      },
    } as any;
    const labels = await resolveEntityLabels(supabase, [{ entity_type: 'hazard', entity_id: 'h1' }]);
    expect(labels.get('hazard:h1')).toBe('Hazard h1…');
  });
});

describe('hrefForEntity', () => {
  it('links a portal-only type to the portal, with portalBase, from admin', () => {
    expect(hrefForEntity('hazard', 'h1', { role: 'admin', companyId: 'co-1', portalBase: 'https://portal.example' }))
      .toBe('https://portal.example/protect/hazards/h1');
  });

  it('links a portal-only type to a relative path from portal itself (no portalBase)', () => {
    expect(hrefForEntity('hazard', 'h1', { role: 'portal', companyId: null }))
      .toBe('/protect/hazards/h1');
  });

  it('links an admin-tracked type to its per-company admin segment when role is admin', () => {
    expect(hrefForEntity('contractor', 'c1', { role: 'admin', companyId: 'co-1' }))
      .toBe('/health-safety/co-1/contractors');
  });

  it('links an audit to its own per-record admin page, not just the list', () => {
    expect(hrefForEntity('audit', 'a1', { role: 'admin', companyId: 'co-1' }))
      .toBe('/health-safety/co-1/audits/a1');
  });

  it('links an admin-tracked type to its portal list page when role is portal', () => {
    expect(hrefForEntity('contractor', 'c1', { role: 'portal', companyId: null }))
      .toBe('/protect/contractors');
  });

  it('returns null for an uncurated type', () => {
    expect(hrefForEntity('isolation', 'iso1', { role: 'admin', companyId: 'co-1' })).toBeNull();
  });

  it('returns null for an admin-tracked type with no companyId and no portal path override', () => {
    // milestone has a portal path, so this proves the fallback chain reaches PORTAL_PATH even without companyId.
    expect(hrefForEntity('milestone', 'm1', { role: 'admin', companyId: null })).toBe('/roadmap');
  });
});
