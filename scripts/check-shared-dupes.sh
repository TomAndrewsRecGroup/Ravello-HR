#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Verify byte-identical duplication of files that exist in BOTH
# admin/ and portal/. We deliberately duplicate this short list of
# utilities instead of extracting them to a shared package, because
# Vercel deploys each app from its own root with no access to a
# repo-level node_modules. See git history for commit 1f17186.
#
# This script keeps the duplicates honest: if anyone edits one side
# without mirroring the change, CI fails.
#
# Usage:
#   scripts/check-shared-dupes.sh           # check (CI mode)
#   scripts/check-shared-dupes.sh --diff    # show diffs for any drift
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# (admin path | portal path) — paths are relative to repo root.
PAIRS=(
  "admin/src/components/ui/AvatarInitials.tsx|portal/src/components/ui/AvatarInitials.tsx"
  "admin/src/components/ui/useModalShell.ts|portal/src/components/ui/useModalShell.ts"
  "admin/src/lib/athletes/validate.ts|portal/src/lib/athletes/validate.ts"
  "admin/src/lib/interests/validate.ts|portal/src/lib/interests/validate.ts"
  "admin/src/lib/ui/statusMaps.ts|portal/src/lib/ui/statusMaps.ts"
  "admin/src/lib/frictionLens.ts|portal/src/lib/frictionLens.ts"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

show_diff=false
if [[ "${1:-}" == "--diff" ]]; then
  show_diff=true
fi

drifted=()
missing=()

for pair in "${PAIRS[@]}"; do
  IFS='|' read -r left right <<< "$pair"

  if [[ ! -f "$left" ]]; then
    missing+=("$left")
    continue
  fi
  if [[ ! -f "$right" ]]; then
    missing+=("$right")
    continue
  fi

  if ! cmp -s "$left" "$right"; then
    drifted+=("$pair")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: shared-dupe pairs reference missing files:"
  printf '  %s\n' "${missing[@]}"
  echo
  echo "Either restore the file or remove the pair from PAIRS in $0."
  exit 2
fi

if [[ ${#drifted[@]} -eq 0 ]]; then
  echo "OK: ${#PAIRS[@]} shared-dupe pairs are byte-identical."
  exit 0
fi

echo "ERROR: shared-dupe pairs have drifted:"
for pair in "${drifted[@]}"; do
  IFS='|' read -r left right <<< "$pair"
  echo "  $left  !=  $right"
done
echo
echo "These files MUST stay byte-identical between admin/ and portal/."
echo "Either:"
echo "  1. Mirror your change to the other side, or"
echo "  2. If you intentionally want them to diverge, remove the pair"
echo "     from PAIRS in scripts/check-shared-dupes.sh and add a"
echo "     comment at the top of each file explaining why."
echo
echo "Re-run with --diff to see what changed."

if $show_diff; then
  echo
  for pair in "${drifted[@]}"; do
    IFS='|' read -r left right <<< "$pair"
    echo "── diff $left  vs  $right ────────────────────"
    diff -u "$left" "$right" || true
    echo
  done
fi

exit 1
