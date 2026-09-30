#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Refuse a readAllPages() (or any other PageQueryBuilder) call whose
# page-query has no stable, unique .order(...) before its .range(from, to).
#
# lib/supabase/paged.ts's own header comment states the rule this
# guards: "A paged read MUST carry a stable, unique sort key. Paging
# walks Range windows, and without a deterministic total order
# Postgres may order two pages differently — silently dropping or
# duplicating rows across the boundary."
#
# Core-OS 360 Phase 19, Group 3 found this violated across 17 files
# (~90 call sites) — including two reads that were never paged at
# all, fully unbounded — none of it caught by any existing guard,
# by tsc, or by the test suite, because every one of them compiled,
# ran and returned a correct-looking answer under 1,000 rows. This
# script is that finding turned into a permanent CI check, per its
# own handover doc's own "the natural next CI check to add."
#
# Heuristic, not a parser: it looks at the text immediately BEFORE
# each literal `.range(from, to)` — the fixed call shape
# PageQueryBuilder's signature produces — and checks for `.order(`
# within that span. A window wide enough for this codebase's longest
# real select() chain, checked by running this script clean against
# the current, already-fixed codebase before relying on it.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

all_hits=""

while IFS= read -r -d '' file; do
  hits=$(perl -0777 -ne '
    while (/(.{0,600}?)\.range\(\s*from\s*,\s*to\s*\)/gs) {
      my $pre = $1;
      my $pos = pos();
      unless ($pre =~ /\.order\(/) {
        my $line = 1 + (substr($_, 0, $pos) =~ tr/\n//);
        print "$line\n";
      }
    }
  ' "$file")
  if [[ -n "$hits" ]]; then
    while IFS= read -r line; do
      all_hits="${all_hits}  ${file}:${line}: .range(from, to) with no preceding .order(...)"$'\n'
    done <<< "$hits"
  fi
done < <(find admin/src portal/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
            -not -path '*/lib/supabase/paged.ts' \
            -not -path '*__tests__*' \
            -print0 2>/dev/null)

if [[ -n "$all_hits" ]]; then
  echo "ERROR: a paged query builder calls .range(from, to) with no .order(...) before it:"
  printf '%s' "$all_hits"
  echo
  echo "Every readAllPages()/PageQueryBuilder callback must carry a stable, unique"
  echo ".order(...) (append '.order(\"id\")' as a tie-break if the query already"
  echo "orders by something else) before .range(from, to) — see"
  echo "lib/supabase/paged.ts's own header comment, rule 1."
  exit 1
fi

echo "OK: every paged query builder's .range(from, to) is preceded by .order(...)."
