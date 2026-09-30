// Every supabase read chain, and whether it has ANY bound at all.
//
// check-row-cap.sh catches a `.limit(N>1000)` — an author-specified
// ceiling that exceeds what PostgREST will ever honour.
// check-paged-order.sh catches a paged-query-builder `.range(from, to)`
// with no preceding `.order(...)` — a real total order, required for
// windowed paging to be safe.
//
// Neither catches the WORSE variant Phase 19's own investigation found
// twice (lib/complianceTwin/loadSnapshot.ts and the original Phase 8
// risk-graph page, both against hs_links): a `.select(...)` chain with
// NO `.range()`, NO `.limit()`, NO `.single()`/`.maybeSingle()` at all —
// relying entirely on PostgREST's own default Max Rows setting (1,000),
// which truncates silently, exactly like an over-large `.limit()` does,
// just with no number anywhere in the source to even LOOK wrong.
//
// Anchored at `.from(` and walked as a real method chain (the
// check-blind-updates.sh precedent), not a line grep — a doc comment or
// an unrelated `.select()` (a <select> DOM ref, a form state setter)
// is not a Supabase chain at all.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync("find admin/src portal/src -name '*.ts' -o -name '*.tsx'", { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .filter(f => !f.endsWith('lib/supabase/paged.ts'))
  .filter(f => !f.includes('__tests__'));

/** Consume balanced parens starting just after an opening one. */
function skipCall(src, i) {
  let d = 1;
  while (i < src.length && d > 0) {
    const c = src[i];
    if (c === '(') d++;
    else if (c === ')') d--;
    i++;
  }
  return i;
}

const BOUNDED = new Set(['range', 'limit', 'single', 'maybeSingle']);

const unbounded = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const re = /\.from\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = skipCall(src, m.index + '.from('.length);
    const names = [];
    let selectArgs = null;
    for (;;) {
      const cont = src.slice(i).match(/^\s*\.\s*([A-Za-z_$][\w$]*)\(/);
      if (!cont) break;
      const argStart = i + cont[0].length;
      const end = skipCall(src, argStart);
      if (cont[1] === 'select' && selectArgs === null) selectArgs = src.slice(argStart, end - 1);
      names.push(cont[1]);
      i = end;
    }
    if (!names.includes('select')) continue; // not a read at all (a bare write)
    if (names.some(n => BOUNDED.has(n))) continue;
    // A head-only count query (`{ count: 'exact', head: true }` as
    // select()'s own second argument) returns zero rows regardless of
    // match count — the row cap cannot truncate data that is never
    // returned.
    if (selectArgs && /head\s*:\s*true/.test(selectArgs)) continue;
    unbounded.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
  }
}

if (process.argv.includes('--count')) console.log(unbounded.length);
else unbounded.sort().forEach(u => console.log('  ' + u));
