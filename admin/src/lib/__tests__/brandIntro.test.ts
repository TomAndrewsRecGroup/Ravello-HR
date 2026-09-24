// The sign-in intro animates the mark's parts by POSITION: blades are
// the first three <g>, the core is the fourth (BrandIntro.module.css,
// g:nth-of-type). Regenerating brandIntroMark.ts from a differently
// grouped SVG would silently animate the wrong shapes, and an
// unprefixed gradient id would collide with anything else inlined.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_MARK_INNER } from '../brandIntroMark';

const css = readFileSync(join(__dirname, '../../components/brand/BrandIntro.module.css'), 'utf8');

describe('brand intro mark', () => {
  it('has exactly four top-level groups: three blades, then the core', () => {
    const body = BRAND_MARK_INNER.slice(BRAND_MARK_INNER.indexOf('</defs>'));
    const groups = body.split('<g').slice(1);
    expect(groups).toHaveLength(4);
    groups.slice(0, 3).forEach(g => expect(g).not.toContain('<circle'));
    expect(groups[3]).toContain('<circle');
  });

  it('prefixes every gradient id and reference', () => {
    const ids  = [...BRAND_MARK_INNER.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const refs = [...BRAND_MARK_INNER.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    [...ids, ...refs].forEach(id => expect(id.startsWith('cosi-')).toBe(true));
    refs.forEach(r => expect(ids).toContain(r));
  });

  it('the stylesheet targets blades 1–3 and the core as group 4', () => {
    expect(css).toContain('g:nth-of-type(-n + 3)');
    expect(css).toContain('g:nth-of-type(4)');
  });

  it('keeps a no-JavaScript exit', () => {
    expect(css).toMatch(/animation:\s*autoExit/);
  });
});
