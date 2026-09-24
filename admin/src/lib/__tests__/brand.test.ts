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

// ── Colour palette (2026-09-24, operator: "change the colours to the Core
// OS 360 palette"). The old brand purple (#7C3AED family) was the primary
// accent in both apps; it is now the Core OS 360 cyan. The ONE deliberate
// survivor is ARG_SENDER's accent: the referral email goes out under
// Andrews Recruitment Group's name and keeps the colours it has always had.
const PURPLE = /#7C3AED|#5A2AC8|#6D28D9|#5A1EC0|124,\s*58,\s*237|143,\s*114,\s*246/i;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('Core OS 360 colour palette', () => {
  const css = ['admin', 'portal'].map(app => readFileSync(path.join(ROOT, app, 'src/app/globals.css'), 'utf8'));

  it('the primary accent token is the brand cyan in both apps', () => {
    for (const c of css) {
      expect(c).toMatch(/--brand-accent:\s*#0B7896;/);
      expect(c).toMatch(/--purple:\s*var\(--brand-accent\);/);
    }
  });

  it('the accent and every white-text gradient stop pass WCAG AA (4.5:1) against white', () => {
    for (const c of css) {
      const accent = /--brand-accent:\s*(#[0-9A-F]{6})/i.exec(c)![1];
      expect(contrast(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      for (const name of ['--gradient', '--gradient-cta']) {
        const g = new RegExp(`${name}:\\s*linear-gradient\\(([^;]*)\\);`).exec(c)![1];
        for (const hex of g.match(/#[0-9A-F]{6}/gi)!) expect(contrast(hex, '#FFFFFF'), `${name} ${hex}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('no old brand purple left anywhere in either app, except the ARG email accent', () => {
    const offenders: string[] = [];
    for (const d of ['admin/src', 'portal/src']) {
      for (const f of walk(path.join(ROOT, d)).concat(
        readdirSync(path.join(ROOT, d, 'app')).filter(n => n.endsWith('.css')).map(n => path.join(ROOT, d, 'app', n)))) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          if (!PURPLE.test(line)) return;
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (f.endsWith('lib/email/layout.ts') && /accent(Dark)?:\s*'#(7C3AED|5A2AC8)'/.test(line)) return;
          offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
