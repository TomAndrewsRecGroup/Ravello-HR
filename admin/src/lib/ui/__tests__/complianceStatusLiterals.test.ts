import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPLIANCE_STATUSES } from '../statusMaps';

// A status literal in a PostgREST chain is checked by nothing until
// Postgres refuses it. Admin /health filtered compliance_items on
// .neq('status', 'completed'); compliance_status has no such value, so
// the query 22P02'd and the page's overdue column was always empty.
//
// This walks BOTH apps and reads every `from('compliance_items')` chain
// up to the next `.from(` or `;`, so a Promise.all array cannot bleed
// one query's filters into its neighbour's.

const REPO = resolve(__dirname, '../../../../..');
const ROOTS = ['admin/src', 'portal/src'];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

function statusLiteralsInComplianceChains(source: string): string[] {
  const found: string[] = [];
  const chain = /from\(\s*['"]compliance_items['"]\s*\)((?:(?!\.from\()[^;])*)/g;
  let m: RegExpExecArray | null;
  while ((m = chain.exec(source))) {
    for (const hit of m[1].matchAll(/['"]?status['"]?\s*[:,]\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
      for (const lit of hit[1].matchAll(/['"]([^'"]*)['"]/g)) found.push(lit[1]);
    }
  }
  return found;
}

describe('compliance_items status literals', () => {
  it('the scanner sees .eq/.neq/.in filters and object writes', () => {
    const src = `
      await Promise.all([
        supabase.from('compliance_items').select('id').neq('status', 'completed'),
        supabase.from('tickets').select('id').in('status', ['open']),
      ]);
      supabase.from('compliance_items').update({ status: 'done' }, { count: 'exact' }).eq('id', x);
      supabase.from('compliance_items').select('id').in('status', ['pending', 'nope']);
    `;
    expect(statusLiteralsInComplianceChains(src)).toEqual(['completed', 'done', 'pending', 'nope']);
  });

  it('every literal in either app is a live compliance_status value', () => {
    const bad: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(REPO, root))) {
        for (const lit of statusLiteralsInComplianceChains(readFileSync(file, 'utf8'))) {
          if (!(COMPLIANCE_STATUSES as readonly string[]).includes(lit)) {
            bad.push(`${file.slice(REPO.length + 1)}: '${lit}'`);
          }
        }
      }
    }
    expect(bad, `not in compliance_status (${COMPLIANCE_STATUSES.join(' | ')})`).toEqual([]);
  });
});
