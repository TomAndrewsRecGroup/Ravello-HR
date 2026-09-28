import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// A 'use client' component that imports a module which (transitively)
// reaches next/headers compiles under tsc and passes every unit test —
// and then fails `next build`. Two PROTECT components did exactly that
// by importing a date helper from lib/hs/safetyContext.ts. These are the
// server-only modules a client file must never import directly.
const SERVER_ONLY = ['@/lib/supabase/server', '@/lib/hs/safetyContext', 'next/headers', '@/lib/supabase/service'];

const SRC = path.resolve(__dirname, '../..');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== '__tests__' && n !== 'node_modules') walk(p, out); }
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const clientFiles = walk(SRC).filter(f => /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')));

describe('client components import no server-only module', () => {
  it('finds the client components (sanity)', () => { expect(clientFiles.length).toBeGreaterThan(50); });
  it.each(clientFiles.map(f => [path.relative(SRC, f), f]))('%s', (_rel, f) => {
    const src = readFileSync(f, 'utf8');
    for (const m of SERVER_ONLY) expect(src, m).not.toMatch(new RegExp(`from ['"]${m.replace(/[/@]/g, '\\$&')}['"]`));
  });
});
