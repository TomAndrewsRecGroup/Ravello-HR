// Every supabase UPDATE chain, and whether it can see its own effect.
//
// Anchored at `.from(` and walked as a real method chain, because a
// line-based grep both misses multi-line chains and reports things that
// are not supabase at all — `registration.update()` from the
// ServiceWorker API and a doc comment mentioning `.update()` were the
// two false positives in the first cut.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync("find admin/src portal/src -name '*.ts' -o -name '*.tsx'", { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

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

const blind = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const re = /\.from\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = skipCall(src, m.index + '.from('.length);
    const names = [];
    let updateArgs = '';
    for (;;) {
      const cont = src.slice(i).match(/^\s*\.\s*([A-Za-z_$][\w$]*)\(/);
      if (!cont) break;
      const argStart = i + cont[0].length;
      const end = skipCall(src, argStart);
      if (cont[1] === 'update') updateArgs = src.slice(argStart, end - 1);
      names.push(cont[1]);
      i = end;
    }
    if (!names.includes('update')) continue;
    const asksRows  = ['select', 'single', 'maybeSingle'].some(n => names.includes(n));
    const asksCount = /count\s*:\s*['"]exact['"]/.test(updateArgs) || /COUNT_EXACT/.test(updateArgs);
    if (asksRows || asksCount) continue;
    blind.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
  }
}

if (process.argv.includes('--count')) console.log(blind.length);
else blind.sort().forEach(b => console.log('  ' + b));
