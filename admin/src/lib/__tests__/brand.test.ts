import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  BRAND_NAME, BRAND_LOGO, BRAND_LOGO_DARK, BRAND_MARK, BRAND_MARK_SIMPLE,
  BRAND_EMAIL_LOGO_URL, BRAND_DEFAULT_FROM, brandFromAddress,
} from '../brand';

// The People System became Core OS 360 on 2026-09-24. The DOMAIN was kept
// (operator: emails, athlete links and anything live still rely on it),
// so the rename is name + artwork only. These pin both halves.

const ROOT = path.resolve(__dirname, '../../../..');

describe('sender display name', () => {
  it('replaces only a pre-rebrand display name, keeping the address', () => {
    expect(brandFromAddress('The People System <noreply@portal.thepeoplesystem.co.uk>'))
      .toBe('Core OS 360 <noreply@portal.thepeoplesystem.co.uk>');
    expect(brandFromAddress('"The People System" <noreply@portal.thepeoplesystem.co.uk>'))
      .toBe('Core OS 360 <noreply@portal.thepeoplesystem.co.uk>');
    expect(brandFromAddress('TPS <noreply@portal.thepeoplesystem.co.uk>'))
      .toBe('Core OS 360 <noreply@portal.thepeoplesystem.co.uk>');
  });
  it('leaves any other sender exactly as configured', () => {
    expect(brandFromAddress('Tom Andrews <tom@andrews-recruitment.com>')).toBe('Tom Andrews <tom@andrews-recruitment.com>');
    expect(brandFromAddress('noreply@portal.thepeoplesystem.co.uk')).toBe('noreply@portal.thepeoplesystem.co.uk');
  });
  it('defaults to the brand on the unchanged domain', () => {
    expect(brandFromAddress(undefined)).toBe(BRAND_DEFAULT_FROM);
    expect(BRAND_DEFAULT_FROM).toBe('Core OS 360 <noreply@portal.thepeoplesystem.co.uk>');
  });
});

describe('brand assets exist in BOTH apps', () => {
  const assets = [BRAND_LOGO, BRAND_LOGO_DARK, BRAND_MARK, BRAND_MARK_SIMPLE,
    '/brand/apple-touch-icon.png', '/brand/icon-192.png', '/brand/icon-512.png',
    '/brand/icon-maskable-512.png', '/brand/favicon-16.png', '/brand/favicon-32.png',
    '/favicon.ico', new URL(BRAND_EMAIL_LOGO_URL).pathname];
  it.each(['admin', 'portal'])('%s/public', (app) => {
    for (const a of assets) expect(existsSync(path.join(ROOT, app, 'public', a)), `${app}${a}`).toBe(true);
  });
  it('the email logo is hosted on the sending domain (Resend flags off-domain images)', () => {
    expect(new URL(BRAND_EMAIL_LOGO_URL).hostname.endsWith('thepeoplesystem.co.uk')).toBe(true);
  });
  it('manifests name the brand and use the new icons', () => {
    for (const app of ['admin', 'portal']) {
      const m = JSON.parse(readFileSync(path.join(ROOT, app, 'public/manifest.json'), 'utf8'));
      expect(m.name).toContain(BRAND_NAME);
      for (const i of m.icons) expect(i.src.startsWith('/brand/')).toBe(true);
    }
  });
});

// No user-visible code may still say The People System or point at the old
// logo. Comments may (they record history), and so may the two Stripe
// lookup keys, which find existing objects by their exact old names.
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) { if (n !== '__tests__' && n !== 'node_modules') walk(f, out); }
    else if (/\.(tsx?|json|js)$/.test(n)) out.push(f);
  }
  return out;
}
describe('no old branding left in code that renders', () => {
  const files = ['admin/src', 'portal/src', 'admin/public', 'portal/public'].flatMap(d => walk(path.join(ROOT, d)));
  it('finds the source (sanity)', () => expect(files.length).toBeGreaterThan(200));
  it('no "People System" outside comments and the Stripe lookup keys', () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim();
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) return;
        if (/RETAINER_PRODUCT_NAME =/.test(line)) return;
        if (/People System/.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
  it('no reference to the old People System logo image', () => {
    const offenders = files.filter(f => readFileSync(f, 'utf8').includes('the%20people%20system'));
    expect(offenders.map(f => path.relative(ROOT, f))).toEqual([]);
  });
});
