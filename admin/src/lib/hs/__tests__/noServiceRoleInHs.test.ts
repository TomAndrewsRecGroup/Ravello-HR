import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The H&S workspace is used by external providers as well as staff.
// Everything a provider may see or write is decided by RLS (094/095),
// and the service role bypasses RLS entirely — one service-role read in
// these folders and a provider sees every client's data. So none of
// them may create or import a service-role client, directly or through
// a helper. Staff-only operations (inviting a provider login) live
// under app/api/admin/hs, behind requireStaff(), deliberately outside
// this list.

const SRC = resolve(__dirname, '../../..');
const DIRS = ['app/(hs)', 'app/api/hs', 'lib/hs', 'components/hs'];
const FORBIDDEN = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  // A value import of supabase-js: a raw client is only ever made here
  // for the service key. `import type { SupabaseClient }` cannot make one.
  /import\s+(?!type\b)[^;]*from ['"]@supabase\/supabase-js['"]/,
  /supabase\/service['"]/,
  /createServiceClient|serviceRoleClient|adminClient\b/,
];

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(e) && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

describe('no service role anywhere a provider can reach', () => {
  const files = DIRS.flatMap(d => walk(join(SRC, d)));

  it('scans real files (so the check is not vacuous)', () => {
    expect(files.some(f => f.includes('lib/hs/'))).toBe(true);
  });

  it.each(DIRS)('%s', (d) => {
    for (const f of files.filter(f => f.includes(`/${d}/`))) {
      const src = readFileSync(f, 'utf8');
      for (const re of FORBIDDEN) expect(src, `${f} matches ${re}`).not.toMatch(re);
    }
  });
});
