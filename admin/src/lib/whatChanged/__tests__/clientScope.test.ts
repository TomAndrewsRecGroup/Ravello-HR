// Core-OS 360 Completion Programme, Phase 25, Group 4 (C9.4). Only
// admin can import both TRIGGERED_ENTITIES (lib/events/types.ts) and
// the client-visible allowlist (clientScope.ts, a shared-dupe pair) —
// this is the one place that drift between them is actually checkable.
// A new entity type added to TRIGGERED_ENTITIES that nobody updates
// this file for would otherwise silently disappear from the client's
// own What Changed page with no test ever noticing.

import { describe, expect, it } from 'vitest';
import { TRIGGERED_ENTITIES } from '@/lib/events/types';
import { CLIENT_VISIBLE_ENTITY_TYPES, EXCLUDED_ENTITY_TYPES, isClientVisibleEntityType, filterClientVisible } from '../clientScope';

describe('CLIENT_VISIBLE_ENTITY_TYPES (C9.4)', () => {
  it('together with EXCLUDED_ENTITY_TYPES, accounts for every entity in TRIGGERED_ENTITIES — no silent gap either way', () => {
    const union = new Set([...CLIENT_VISIBLE_ENTITY_TYPES, ...EXCLUDED_ENTITY_TYPES]);
    expect([...union].sort()).toEqual([...TRIGGERED_ENTITIES].sort());
  });

  it('has no entity type listed in both the visible and excluded sets', () => {
    const excluded = new Set(EXCLUDED_ENTITY_TYPES);
    for (const t of CLIENT_VISIBLE_ENTITY_TYPES) {
      expect(excluded.has(t), t).toBe(false);
    }
  });

  it('excludes exactly the documented staff-internal/pre-client/disclosure-controlled entity types', () => {
    expect([...EXCLUDED_ENTITY_TYPES].sort()).toEqual(
      ['bd_companies', 'board_assurance_reports', 'companies', 'enquiries', 'internal_tasks', 'referral_scan_runs'].sort(),
    );
  });

  it('isClientVisibleEntityType agrees with the set for both a visible and an excluded type', () => {
    expect(isClientVisibleEntityType('hs_incidents')).toBe(true);
    expect(isClientVisibleEntityType('internal_tasks')).toBe(false);
    expect(isClientVisibleEntityType('board_assurance_reports')).toBe(false);
  });

  it('filterClientVisible drops every excluded-type row and keeps every visible-type row', () => {
    const events = [
      { entity_type: 'hs_incidents' },
      { entity_type: 'internal_tasks' },
      { entity_type: 'companies' },
      { entity_type: 'compliance_items' },
      { entity_type: 'board_assurance_reports' },
    ];
    expect(filterClientVisible(events).map(e => e.entity_type)).toEqual(['hs_incidents', 'compliance_items']);
  });
});
