#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Refuse any query asking for more than 1,000 rows.
#
# Supabase caps every PostgREST response at a server-side Max Rows
# value — 1,000 by default. Neither .limit(5000) nor .range(0, 99999)
# raises it. So a .limit() above the cap is not an optimisation or a
# generous ceiling: it is a request that CANNOT do what its author
# intended, and it fails silently.
#
# This codebase carried 31 of them, including both CSV export pages.
# Use readAllPages() from lib/supabase/paged.ts instead.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# paged.ts documents the problem and necessarily names the number.
hits=$(grep -rnE "\.limit\(\s*([1-9][0-9]{3,})\s*\)" \
        --include='*.ts' --include='*.tsx' \
        admin/src portal/src src 2>/dev/null \
        | grep -v 'lib/supabase/paged.ts' \
        | grep -v 'check-row-cap' || true)

if [[ -n "$hits" ]]; then
  echo "ERROR: queries requesting more than 1,000 rows (PostgREST clamps these silently):"
  echo "$hits" | sed 's/^/  /'
  echo
  echo "Use readAllPages() from lib/supabase/paged.ts, with a stable UNIQUE sort key."
  exit 1
fi

echo "OK: no query requests more than the 1,000-row PostgREST cap."
