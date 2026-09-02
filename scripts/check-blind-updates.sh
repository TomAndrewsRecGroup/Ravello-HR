#!/usr/bin/env bash
# Ratchet: a supabase UPDATE must be able to tell "written" from
# "silently matched no rows".
#
# An UPDATE that matches no rows returns error:null. RLS refusing a
# write is therefore indistinguishable from success, and the caller
# shows a green tick over a row that never changed. That is not
# hypothetical — see the 2026-09-02 headcount entry in CLAUDE.md.
#
# A chain counts as SAFE when it asks for the affected rows back
# (.select/.single/.maybeSingle) or asks for a count ({ count: 'exact' }).
# The number may only shrink.
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE=113

COUNT=$(node scripts/lib/scan-blind-updates.mjs --count)

if [ "$COUNT" -gt "$BASELINE" ]; then
  echo "FAIL: $COUNT supabase UPDATE chains cannot tell a no-op from a success (baseline $BASELINE)."
  echo
  node scripts/lib/scan-blind-updates.mjs
  echo
  echo "Add { count: 'exact' } and check it with judgeWrite(), or .select() the affected rows."
  exit 1
fi

if [ "$COUNT" -lt "$BASELINE" ]; then
  echo "OK: $COUNT blind UPDATE chains — down from $BASELINE. Lower the baseline in this script."
  exit 0
fi

echo "OK: $COUNT blind UPDATE chains, all known. No new ones."
