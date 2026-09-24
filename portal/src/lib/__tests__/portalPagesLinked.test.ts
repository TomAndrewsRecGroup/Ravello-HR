import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Eight finished portal pages (HR Dashboard, Absence, Employee Docs,
// Reviews, Training, Skills, People Roadmap, Hiring Analytics) had no
// link from any menu or tab — built, working, and unfindable. The admin
// app has scripts/check-admin-routes-linked.sh for exactly this; this is
// the portal's equivalent: every static page's path must appear as a
// link target somewhere in the app other than the route-flag map.

const SRC = path.resolve(__dirname, '../..');
const APP = path.join(SRC, 'app/(portal)');

function walk(dir: string, pred: (f: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, pred, out);
    else if (pred(full)) out.push(full);
  }
  return out;
}

const pages = walk(APP, f => f.endsWith('/page.tsx'))
  .map(f => path.relative(APP, path.dirname(f)).split(path.sep).join('/'))
  .map(r => '/' + r)
  .filter(r => r !== '/' && !r.includes('['));   // dynamic pages are reached from their lists

// Every source file except tests and the route-flag map. Cache
// revalidation calls name a path without linking to it, so they are
// stripped, and a page's OWN files never count as a link to itself.
const sources = walk(SRC, f => /\.(tsx?|jsx?)$/.test(f) && !f.includes('__tests__') && !f.endsWith('lib/moduleAccess.ts'))
  .map(f => ({
    file: f,
    text: readFileSync(f, 'utf8').replace(/revalidate\w*Path\([^)]*\)/g, ''),
  }));

describe('every portal page is linked from somewhere', () => {
  it('finds the pages (sanity)', () => {
    expect(pages.length).toBeGreaterThan(25);
  });

  it.each(pages)('%s', (route) => {
    // A quoted literal ('/x', "/x", `/x`) or the start of a templated
    // one (`/x?…`) — how every menu, tab, button and redirect names it.
    const esc = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`['"\`]${esc}(['"\`?#])`);
    const ownDir = path.join(APP, route) + path.sep;
    const linkedFrom = sources.filter(s => !s.file.startsWith(ownDir) && re.test(s.text));
    expect(linkedFrom.length).toBeGreaterThan(0);
  });
});
