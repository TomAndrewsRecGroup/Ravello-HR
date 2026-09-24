import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTAL_REDIRECTS } from '../../../redirects.mjs';

// PROTECT became Health & Safety on 2026-09-24 and its HR pages moved to
// LEAD. A redirect whose source still has a page shadows nothing and
// hides a stale copy; one whose destination has no page sends a
// bookmarked link to a 404.
const APP = resolve(__dirname, '../../app/(portal)');
const page = (route: string) => existsSync(`${APP}${route}/page.tsx`);
type R = { source: string; destination: string; permanent: boolean };

describe('moved portal pages redirect', () => {
  const exact = (PORTAL_REDIRECTS as R[]).filter(r => !r.source.includes(':'));

  it.each(['absence', 'offboarding', 'hr-dashboard', 'employee-docs'])('/protect/%s → /lead/%s', (p) => {
    expect(exact).toContainEqual({ source: `/protect/${p}`, destination: `/lead/${p}`, permanent: true });
  });

  it.each(exact.map(r => [r.source, r.destination]))('%s has no page left, %s has one', (source, destination) => {
    expect(page(source), source).toBe(false);
    expect(page(destination), destination).toBe(true);
  });

  it('deeper paths follow too', () => {
    for (const r of exact) {
      expect(PORTAL_REDIRECTS).toContainEqual({ source: `${r.source}/:path*`, destination: `${r.destination}/:path*`, permanent: true });
    }
  });
});
