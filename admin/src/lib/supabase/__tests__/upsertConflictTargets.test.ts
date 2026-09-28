import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every upsert(…, { onConflict: 'cols' }) in either app must name columns
// that carry a NON-PARTIAL unique index, unique constraint or primary key.
//
// Why: Postgres infers a partial unique index for ON CONFLICT only when
// the statement repeats its WHERE predicate, and PostgREST never sends
// one. 096-104 created their idempotency keys as `… WHERE key IS NOT
// NULL`, so every keyed upsert into platform_events, notifications,
// email_log, internal_tasks, actions, calendar events, employee_records
// and performance_reviews failed with 42P10 — including every
// notification notify() would ever write. Nothing caught it: the code
// compiled, the unit tests use fakes, and the failures surfaced only as
// a "degraded" cron tally. 126a replaced them with full unique indexes;
// this test stops the next one.

const ROOT = resolve(__dirname, '../../../../..');
const MIG = join(ROOT, 'supabase/migrations');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const norm = (cols: string) => cols.split(',').map(c => c.trim().replace(/"/g, '')).filter(Boolean).sort().join(',');

/** table → set of column lists that are validly unique (not partial). */
function uniqueTargets(): Map<string, Set<string>> {
  const files = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
  const indexes = new Map<string, { table: string; cols: string; partial: boolean }>();
  const constraints = new Map<string, Set<string>>();
  const add = (table: string, cols: string) => {
    if (!constraints.has(table)) constraints.set(table, new Set());
    constraints.get(table)!.add(norm(cols));
  };
  for (const f of files) {
    const sql = readFileSync(join(MIG, f), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/CREATE UNIQUE INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?(\w+)\s+ON (?:public\.)?(\w+)\s*(?:USING \w+\s*)?\(([^;]*?)\)\s*(WHERE[^;]*)?;/gi)) {
      indexes.set(m[1], { table: m[2], cols: norm(m[3]), partial: !!m[4] });
    }
    for (const m of sql.matchAll(/DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:public\.)?(\w+)/gi)) indexes.delete(m[1]);
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      const [, table, body] = m;
      for (const line of body.split('\n')) {
        const col = /^\s*(\w+)\s+[\w\[\]() ]+?\b(PRIMARY KEY|UNIQUE)\b/i.exec(line);
        if (col && !/^\s*(CONSTRAINT|UNIQUE|PRIMARY)\b/i.test(line)) add(table, col[1]);
      }
      for (const u of body.matchAll(/(?:UNIQUE|PRIMARY KEY)\s*\(([^)]+)\)/gi)) add(table, u[1]);
    }
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?(?:public\.)?(\w+)[^;]*?ADD (?:CONSTRAINT \w+ )?(?:UNIQUE|PRIMARY KEY)\s*\(([^)]+)\)/gi)) add(m[1], m[2]);
  }
  for (const { table, cols, partial } of indexes.values()) if (!partial) add(table, cols);
  return constraints;
}

function codeTargets(): { file: string; table: string; cols: string }[] {
  const out: { file: string; table: string; cols: string }[] = [];
  for (const app of ['admin/src', 'portal/src']) {
    for (const file of walk(join(ROOT, app))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/onConflict:\s*'([^']+)'/g)) {
        const before = src.slice(0, m.index);
        const froms = [...before.matchAll(/\.from\('(\w+)'\)/g)];
        if (!froms.length) continue;
        out.push({ file: file.slice(ROOT.length + 1), table: froms[froms.length - 1][1], cols: norm(m[1]) });
      }
    }
  }
  return out;
}

describe('upsert conflict targets are inferable', () => {
  const targets = codeTargets();
  const uniques = uniqueTargets();

  it('finds the upserts it is meant to police', () => {
    expect(targets.length).toBeGreaterThanOrEqual(20);
    expect(targets.some(t => t.table === 'notifications' && t.cols === 'dedupe_key')).toBe(true);
  });

  it.each(codeTargets().map(t => [`${t.table}(${t.cols}) in ${t.file}`, t] as const))('%s', (_n, t) => {
    const ok = uniques.get(t.table)?.has(t.cols) ?? false;
    expect(ok, `${t.table}(${t.cols}) has no non-partial unique index or constraint`).toBe(true);
  });

  it('the 126a replacements are full indexes', () => {
    for (const [table, cols] of [['platform_events', 'dedupe_key'], ['notifications', 'dedupe_key'], ['email_log', 'dedupe_key'],
      ['internal_tasks', 'source_ref'], ['actions', 'company_id,source_ref'], ['company_calendar_events', 'company_id,source_ref'],
      ['employee_records', 'source_candidate_id'], ['performance_reviews', 'company_id,source_ref']]) {
      expect(uniques.get(table)?.has(norm(cols)), `${table}(${cols})`).toBe(true);
    }
  });
});
