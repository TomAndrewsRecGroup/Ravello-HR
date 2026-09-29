import { describe, expect, it } from 'vitest';
import { computeWhatChanged, labelForEntityType, type PlatformEventRow } from '../compute';

function ev(entity_type: string, event_type: PlatformEventRow['event_type'], actor_kind = 'staff'): PlatformEventRow {
  return { entity_type, event_type, actor_kind };
}

describe('computeWhatChanged', () => {
  it('returns an empty summary for no events', () => {
    const out = computeWhatChanged([], '2026-09-29');
    expect(out).toEqual({ day: '2026-09-29', totalEvents: 0, categories: [], systemActorCount: 0, humanActorCount: 0 });
  });

  it('groups by entity_type and event_type, counting each verb separately', () => {
    const out = computeWhatChanged([
      ev('hazards', 'created'), ev('hazards', 'created'), ev('hazards', 'updated'), ev('hazards', 'deleted'),
    ], '2026-09-29');
    expect(out.categories).toEqual([
      { entityType: 'hazards', label: 'Hazards', created: 2, updated: 1, deleted: 1, reminders: 0, total: 4 },
    ]);
    expect(out.totalEvents).toBe(4);
  });

  it('counts a reminder row separately from created/updated/deleted, never silently dropping it from every breakdown column while still inflating total', () => {
    // Found in Group 3's adversarial review: lib/reminders/run.ts
    // writes event_type = 'reminder' directly into platform_events for
    // every due-date bucket it fires — a real fourth value the first
    // version of this module never branched on, so `total` counted a
    // reminder row but none of created/updated/deleted did.
    const out = computeWhatChanged([
      ev('compliance_items', 'reminder'), ev('compliance_items', 'reminder'), ev('compliance_items', 'created'),
    ], '2026-09-29');
    expect(out.categories).toEqual([
      { entityType: 'compliance_items', label: 'Register items', created: 1, updated: 0, deleted: 0, reminders: 2, total: 3 },
    ]);
    // The breakdown columns must sum to the total — the exact property
    // the original bug violated.
    const cat = out.categories[0];
    expect(cat.created + cat.updated + cat.deleted + cat.reminders).toBe(cat.total);
  });

  it('sorts categories by total descending', () => {
    const out = computeWhatChanged([
      ev('actions', 'created'),
      ev('hazards', 'created'), ev('hazards', 'created'), ev('hazards', 'created'),
      ev('offers', 'created'), ev('offers', 'created'),
    ], '2026-09-29');
    expect(out.categories.map(c => c.entityType)).toEqual(['hazards', 'offers', 'actions']);
  });

  it('breaks a tie in total by entityType ascending, deterministically', () => {
    const out = computeWhatChanged([ev('offers', 'created'), ev('actions', 'created')], '2026-09-29');
    expect(out.categories.map(c => c.entityType)).toEqual(['actions', 'offers']);
  });

  it('counts a system-actored event separately from a human-actored one', () => {
    const out = computeWhatChanged([
      ev('hs_register_completions', 'created', 'system'),
      ev('hazards', 'created', 'staff'),
      ev('offers', 'created', 'client'),
    ], '2026-09-29');
    expect(out.systemActorCount).toBe(1);
    expect(out.humanActorCount).toBe(2);
  });

  it('carries the day string through unchanged — it is metadata, never used to filter', () => {
    const out = computeWhatChanged([ev('hazards', 'created')], '2026-01-01');
    expect(out.day).toBe('2026-01-01');
  });
});

describe('labelForEntityType', () => {
  it('uses the curated label for a known entity type', () => {
    expect(labelForEntityType('hazards')).toBe('Hazards');
    expect(labelForEntityType('coshh_assessments')).toBe('COSHH assessments');
  });

  it('falls back to a humanised (still-plural) table name for an unlisted entity type, never throwing', () => {
    // Deliberately not singularised (see compute.ts's own comment) —
    // "Bd companies" reads fine; a naive trailing-'s' strip would have
    // produced the wrong word ("companie") for an irregular plural.
    expect(labelForEntityType('internal_tasks')).toBe('Internal tasks');
    expect(labelForEntityType('bd_companies')).toBe('Bd companies');
    expect(labelForEntityType('')).toBe('');
  });
});
