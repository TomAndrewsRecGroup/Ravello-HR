import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ROUTE_FLAGS, UNGATED_ROUTES, disabledFlagFor, isRouteEnabled, requiredFlagsFor,
} from '../moduleAccess';

// Flags used to lock only sidebar items; pages opened by URL regardless
// and most sub-module flags were checked nowhere. These pin the one map
// the middleware, tabs and Quick Actions now share.

describe('requiredFlagsFor', () => {
  it('uses the longest segment-boundary prefix', () => {
    expect(requiredFlagsFor('/lead/org-chart')).toEqual(['lead', 'org_chart']);
    expect(requiredFlagsFor('/lead/org-chart/anything')).toEqual(['lead', 'org_chart']);
    expect(requiredFlagsFor('/hire/hiring/analytics')).toEqual(['hiring', 'hiring_analytics']);
    expect(requiredFlagsFor('/hire/hiring/new')).toEqual(['hiring']);
  });

  it('does not match a prefix mid-segment', () => {
    // '/support' must not capture '/supportive', nor '/lead' '/leader'.
    expect(requiredFlagsFor('/supportive')).toEqual([]);
    expect(requiredFlagsFor('/leader')).toEqual([]);
  });

  it('gates free programmes by their OWN flag only', () => {
    // A free client (Old Albanians today: learning on, lead off) must
    // keep reaching Learning and Friction Lens.
    expect(isRouteEnabled('/lead/learning', { lead: false, learning: true })).toBe(true);
    expect(isRouteEnabled('/hire/friction-lens', { hiring: false, friction_lens: true })).toBe(true);
  });

  it('leaves ungated pages and API routes alone', () => {
    for (const p of ['/dashboard', '/settings', '/billing', '/dev-plans/abc', '/api/actions/1']) {
      expect(requiredFlagsFor(p)).toEqual([]);
    }
  });
});

describe('disabledFlagFor', () => {
  it('blocks when the master module is off', () => {
    expect(disabledFlagFor('/lead/org-chart', { lead: false })).toBe('lead');
  });

  it('blocks when only the sub-module is off', () => {
    expect(disabledFlagFor('/lead/org-chart', { lead: true, org_chart: false })).toBe('org_chart');
    expect(disabledFlagFor('/calendar', { calendar: false })).toBe('calendar');
  });

  it('treats a missing flag as ON (only === false blocks)', () => {
    expect(disabledFlagFor('/lead/org-chart', {})).toBeNull();
    expect(disabledFlagFor('/lead/org-chart', null)).toBeNull();
    expect(disabledFlagFor('/lead/absence', { lead: true })).toBeNull();
  });
});

// Every page must be decided — gated or deliberately open. A new page in
// neither list fails here instead of shipping reachable by URL.
function pageRoutes(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...pageRoutes(full, `${base}/${name}`));
    } else if (name === 'page.tsx') {
      out.push(base || '/');
    }
  }
  return out;
}

describe('every portal page is decided', () => {
  const root = path.resolve(__dirname, '../../app/(portal)');
  const pages = pageRoutes(root);

  it('finds the pages (sanity)', () => {
    expect(pages.length).toBeGreaterThan(30);
  });

  it.each(pages)('%s is gated or explicitly ungated', (route) => {
    const concrete = route.replace(/\[[^\]]+\]/g, 'x');
    const gated = requiredFlagsFor(concrete).length > 0;
    const open  = UNGATED_ROUTES.some(u => concrete === u || concrete.startsWith(u + '/'));
    expect(gated || open).toBe(true);
  });

  it('has no map entry pointing at a page that does not exist', () => {
    for (const prefix of Object.keys(ROUTE_FLAGS)) {
      expect(pages.some(p => p === prefix || p.startsWith(prefix + '/'))).toBe(true);
    }
  });
});
