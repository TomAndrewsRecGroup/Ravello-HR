import { describe, it, expect } from 'vitest';
import { activeHref, isUnder } from '../navMatch';

// The live sidebar's hrefs, so the regressions below are asserted
// against the real shape of the navigation rather than a toy fixture.
const HREFS = [
  '/clients', '/clients/onboard', '/users', '/engagement', '/feature-flags',
  '/hiring', '/hiring/templates', '/candidates', '/salary-benchmarks',
  '/bd-intelligence', '/bd-roles', '/health',
  '/tasks', '/activity', '/enquiries', '/requests', '/support', '/broadcast', '/compliance',
  '/athletes-to-industry', '/dev-plans', '/referrals',
  '/revenue', '/value-reports', '/reports', '/documents', '/latest-updates', '/learning', '/roadmap',
  '/settings/email',
];

describe('isUnder', () => {
  it('matches the href itself', () => {
    expect(isUnder('/hiring', '/hiring')).toBe(true);
  });

  it('matches a descendant', () => {
    expect(isUnder('/hiring/abc-123', '/hiring')).toBe(true);
  });

  it('does NOT match a sibling whose name merely extends the href', () => {
    // A bare startsWith says true here. That is the latent bug: it is
    // invisible today only because no two live routes share a prefix,
    // so it would surface as a wrong highlight the day one is added.
    expect(isUnder('/reports-archive', '/reports')).toBe(false);
    expect(isUnder('/hiringx', '/hiring')).toBe(false);
  });
});

describe('activeHref', () => {
  it('returns null for a path in no group', () => {
    expect(activeHref('/dashboard', HREFS)).toBeNull();
  });

  it('resolves an exact match', () => {
    expect(activeHref('/tasks', HREFS)).toBe('/tasks');
  });

  // Regression 1: /hiring/templates used to highlight BOTH Roles and
  // Templates, because each item was tested with an independent prefix
  // check that could not see a longer item had also matched.
  it('prefers the most specific item over its parent', () => {
    expect(activeHref('/hiring/templates', HREFS)).toBe('/hiring/templates');
    expect(activeHref('/clients/onboard', HREFS)).toBe('/clients/onboard');
    expect(activeHref('/hiring/templates/new', HREFS)).toBe('/hiring/templates');
  });

  // Regression 2: /clients/<id> used to highlight nothing at all. The
  // old code excluded '/clients' from prefix matching to stop
  // regression 1 on that group, which broke every client detail page.
  it('highlights the parent on a detail page beneath it', () => {
    expect(activeHref('/clients/a3f1e0c2-0000-4000-8000-000000000000', HREFS)).toBe('/clients');
    expect(activeHref('/hiring/42', HREFS)).toBe('/hiring');
    expect(activeHref('/support/7', HREFS)).toBe('/support');
  });

  it('does not depend on the order items are declared in', () => {
    const reversed = [...HREFS].reverse();
    for (const path of ['/hiring/templates', '/clients/onboard', '/clients/x', '/settings/email']) {
      expect(activeHref(path, reversed)).toBe(activeHref(path, HREFS));
    }
  });

  it('never returns more than one winner for any live route', () => {
    // The property the old code violated: for any path, at most one
    // item is active. Asserted over every href plus a child of each.
    for (const href of HREFS) {
      for (const path of [href, `${href}/child`]) {
        const winner = activeHref(path, HREFS);
        expect(winner).not.toBeNull();
        expect(HREFS.filter(h => h === winner)).toHaveLength(1);
      }
    }
  });
});
