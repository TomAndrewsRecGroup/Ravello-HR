import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A guard that asks "is this a user session?" with
//   current_user IN ('authenticated', 'anon')
// only works when it runs as the CALLER. Inside a SECURITY DEFINER
// function current_user is the function's OWNER, so the test is always
// false and every session-only rule is silently skipped.
//
// 088 wrote that rule down; 134 still shipped a DEFINER guard, and an
// employee's self-submitted certificate was stored as verified until a
// live probe caught it (134a). This checks the LATEST definition of every
// function across all migrations, so a later CREATE OR REPLACE cannot
// quietly flip one back.
const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const files = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();

type Def = { file: string; header: string; body: string };
const latest = new Map<string, Def>();
for (const file of files) {
  const src = readFileSync(`${MIG}/${file}`, 'utf8');
  for (const m of src.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\s*\(([\s\S]*?)\bAS\s+(\$\w*\$)([\s\S]*?)\3/g)) {
    latest.set(m[1], { file, header: m[2], body: m[4] });
  }
}
const SESSION_TEST = /current_user\s+(NOT\s+)?IN\s*\(\s*'authenticated'/;

describe('guards that key on current_user', () => {
  const keyed = [...latest.entries()].filter(([, d]) => SESSION_TEST.test(d.body));

  it('exist (the scan is finding them)', () => {
    const names = keyed.map(([n]) => n);
    expect(names).toContain('workforce_evidence_guard');
    expect(names).toContain('employee_records_sensitive_write_guard');
  });

  it('are SECURITY INVOKER in their latest definition', () => {
    const definer = keyed.filter(([, d]) => /SECURITY\s+DEFINER/.test(d.header)).map(([n, d]) => `${n} (${d.file})`);
    expect(definer).toEqual([]);
  });
});
