import { describe, expect, it } from 'vitest';
import { governanceCalendarEvents, groupByMonth } from '../calendar';

// A minimal chainable query-builder fake: every filter method returns
// `this`, and the object is itself thenable, resolving with the fixed
// rows registered for that table. This tests the AGGREGATION/UNION/
// grouping logic the calendar owns — not PostgREST's own filtering,
// which is exercised live by the migration 162 probe.
function fakeSb(tables: Record<string, { id: string; company_id: string; [k: string]: unknown }[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        gte: () => builder,
        lte: () => builder,
        in: () => builder,
        limit: () => builder,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as any;
}

describe('governanceCalendarEvents', () => {
  it('aggregates dated rows across at least 3 different source tables into one sorted list', async () => {
    const sb = fakeSb({
      audit_programmes: [{ id: 'a1', company_id: 'c1', name: 'Fire audit', next_due_date: '2026-11-05', active: true }],
      management_reviews: [{ id: 'r1', company_id: 'c1', review_date: '2026-11-01', status: 'scheduled' }],
      objectives: [{ id: 'o1', company_id: 'c1', title: 'Reduce incidents', target_date: '2026-11-20', status: 'active' }],
      organisation_legal_obligations: [],
      hs_documents: [],
      environmental_permits: [],
      permit_conditions: [],
      iso_certifications: [],
    });

    const events = await governanceCalendarEvents(sb, { companyId: 'c1', from: '2026-11-01', to: '2026-11-30' });

    expect(events).toHaveLength(3);
    const types = new Set(events.map(e => e.type));
    expect(types.has('audit_programme')).toBe(true);
    expect(types.has('management_review')).toBe(true);
    expect(types.has('objective_target')).toBe(true);
    // sorted by date ascending
    expect(events.map(e => e.date)).toEqual(['2026-11-01', '2026-11-05', '2026-11-20']);
  });

  it('never invents a link — every event carries a real admin and portal link', async () => {
    const sb = fakeSb({
      audit_programmes: [{ id: 'a1', company_id: 'c1', name: 'Fire audit', next_due_date: '2026-11-05', active: true }],
      management_reviews: [], objectives: [], organisation_legal_obligations: [], hs_documents: [],
      environmental_permits: [], permit_conditions: [], iso_certifications: [],
    });
    const events = await governanceCalendarEvents(sb, { companyId: 'c1', from: '2026-11-01', to: '2026-11-30' });
    expect(events[0].adminLink).toBe('/health-safety/c1/audits');
    expect(events[0].portalLink).toBe('/protect/audits');
  });

  it('a row missing its date column is skipped, never rendered as an undated event', async () => {
    const sb = fakeSb({
      audit_programmes: [{ id: 'a1', company_id: 'c1', name: 'No date', next_due_date: null, active: true }],
      management_reviews: [], objectives: [], organisation_legal_obligations: [], hs_documents: [],
      environmental_permits: [], permit_conditions: [], iso_certifications: [],
    });
    const events = await governanceCalendarEvents(sb, { companyId: 'c1', from: '2026-11-01', to: '2026-11-30' });
    expect(events).toHaveLength(0);
  });

  it('groupByMonth buckets events by their calendar month', () => {
    const grouped = groupByMonth([
      { type: 'audit_programme', date: '2026-11-05', company_id: 'c1', title: 'x', adminLink: '/a', portalLink: '/p' },
      { type: 'objective_target', date: '2026-11-20', company_id: 'c1', title: 'y', adminLink: '/a', portalLink: '/p' },
      { type: 'management_review', date: '2026-12-01', company_id: 'c1', title: 'z', adminLink: '/a', portalLink: '/p' },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].month).toBe('2026-11');
    expect(grouped[0].events).toHaveLength(2);
    expect(grouped[1].month).toBe('2026-12');
    expect(grouped[1].events).toHaveLength(1);
  });

  it('with no companyId, spans every organisation (the cross-client view)', async () => {
    const sb = fakeSb({
      audit_programmes: [
        { id: 'a1', company_id: 'c1', name: 'Fire audit', next_due_date: '2026-11-05', active: true },
        { id: 'a2', company_id: 'c2', name: 'Electrical audit', next_due_date: '2026-11-06', active: true },
      ],
      management_reviews: [], objectives: [], organisation_legal_obligations: [], hs_documents: [],
      environmental_permits: [], permit_conditions: [], iso_certifications: [],
    });
    const events = await governanceCalendarEvents(sb, { from: '2026-11-01', to: '2026-11-30' });
    expect(events.map(e => e.company_id).sort()).toEqual(['c1', 'c2']);
  });
});
