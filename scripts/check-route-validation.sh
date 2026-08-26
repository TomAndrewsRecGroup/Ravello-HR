#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Every API route that reads a request body must validate it.
#
# RLS answers "who may write to this row". It does not answer "what may
# be written" — nothing enforced string length, numeric range, required
# fields or shape. zod was a dependency used on 2 of 88 routes.
#
# This is a RATCHET, not a clean-slate gate. The known-unvalidated
# routes are listed below and the count may only go DOWN: adding a route
# that reads a body without validating it fails CI, and so does leaving
# a route on the list after fixing it. That way the gap shrinks and can
# never silently grow back.
#
# To fix a route: parseBody/parseForm from lib/validation, a schema
# built from lib/validation/primitives, then delete its line here.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ALLOWED_UNVALIDATED_FILE="scripts/unvalidated-routes.txt"

unvalidated=()
for f in $(find admin/src/app/api portal/src/app/api -name route.ts | sort); do
  grep -qE "req\.json\(\)|request\.json\(\)|\.formData\(\)" "$f" || continue
  grep -qE "parseBody|parseForm|safeParse|z\.object" "$f" && continue
  unvalidated+=("$f")
done

allowed=()
[[ -f "$ALLOWED_UNVALIDATED_FILE" ]] && mapfile -t allowed < <(grep -vE '^\s*(#|$)' "$ALLOWED_UNVALIDATED_FILE" || true)

fail=0

# New offenders: a route reading a body with no validation and not on the list.
for f in "${unvalidated[@]:-}"; do
  [[ -z "$f" ]] && continue
  found=0
  for a in "${allowed[@]:-}"; do [[ "$f" == "$a" ]] && found=1 && break; done
  if [[ $found -eq 0 ]]; then
    [[ $fail -eq 0 ]] && echo "ERROR: route reads a request body without validating it:"
    echo "  $f"
    fail=1
  fi
done

# Stale entries: fixed, but still listed. The ratchet only works if the
# list is trimmed as routes are done.
for a in "${allowed[@]:-}"; do
  [[ -z "$a" ]] && continue
  found=0
  for f in "${unvalidated[@]:-}"; do [[ "$f" == "$a" ]] && found=1 && break; done
  if [[ $found -eq 0 ]]; then
    echo "ERROR: $a is validated (or gone) but still listed in $ALLOWED_UNVALIDATED_FILE — remove the line."
    fail=1
  fi
done

if [[ $fail -eq 1 ]]; then
  echo
  echo "Use parseBody()/parseForm() from lib/validation with a schema built"
  echo "from lib/validation/primitives.ts."
  exit 1
fi

echo "OK: ${#unvalidated[@]} route(s) still unvalidated, all known. No new ones."
