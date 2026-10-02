#!/usr/bin/env bash
# Ratchet: a supabase read chain must have SOME bound — .range(),
# .limit(), .single() or .maybeSingle() — or a head-only count.
#
# check-row-cap.sh catches a `.limit(N>1000)`, an author-specified
# ceiling PostgREST will never honour. check-paged-order.sh catches a
# paged-query-builder .range(from, to) with no preceding .order(...).
# Neither catches the worse variant Core-OS 360 Phase 19 found twice
# (lib/complianceTwin/loadSnapshot.ts and the original Phase 8
# risk-graph page, both against hs_links): a .select(...) chain with NO
# bound at all, relying entirely on PostgREST's own default Max Rows
# (1,000), which truncates silently — see scripts/lib/scan-unbounded-
# reads.mjs's own header for the full defect class.
#
# 302 pre-existing instances were found auditing the live codebase for
# Phase 29 (Security, Regression & Production Certification) — far too
# many to fix in one pass without real per-table risk analysis this
# guard cannot do (most are small reference/config tables, safe today;
# a few are the exact genuinely-large-table class that already bit this
# codebase twice). Per this codebase's own established discipline
# (check-blind-updates.sh, check-route-validation.sh), the honest move
# is a ratchet: stop a NEW unbounded read from being added, and let the
# count shrink as each existing one is actually reviewed and fixed.
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE=301

COUNT=$(node scripts/lib/scan-unbounded-reads.mjs --count)

if [ "$COUNT" -gt "$BASELINE" ]; then
  echo "FAIL: $COUNT unbounded supabase read chains (baseline $BASELINE):"
  echo
  node scripts/lib/scan-unbounded-reads.mjs
  echo
  echo "Add .range()/.limit() (readAllPages() from lib/supabase/paged.ts for an"
  echo "unbounded read), or .single()/.maybeSingle() for a unique-row read."
  exit 1
fi

if [ "$COUNT" -lt "$BASELINE" ]; then
  echo "OK: $COUNT unbounded read chains — down from $BASELINE. Lower the baseline in this script."
  exit 0
fi

echo "OK: $COUNT unbounded read chains, all known. No new ones."
