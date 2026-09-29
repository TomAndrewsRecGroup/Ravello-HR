#!/usr/bin/env bash
# Every admin page must be reachable — not just by a sidebar entry on
# its own TOP-LEVEL segment, but by an actual link named somewhere in
# the app.
#
# Three finished pages were not: /candidates (the cross-client
# candidate list with screening scores), /feature-flags (per-client
# module toggles) and /roadmap had no link from anywhere in the app —
# the only way to reach them was to type the URL. Nothing failed,
# nothing warned; they were simply invisible, and /feature-flags is an
# operational control the admin needs.
#
# Later, three MORE pages slipped past this guard's ORIGINAL check
# (/health-safety/legal-register, /health-safety/iso-readiness,
# /health-safety/governance-calendar, found during the Core-OS 360
# Phase 5 Group 9 UI-consistency pass): each sat under an
# already-linked top-level prefix (/health-safety, linked via the
# per-client workspace card) while having no link of its own anywhere
# in the app. The guard only ever matched the FIRST path segment
# against the sidebar, so a linked top-level prefix hid an unlinked
# page underneath it — a real gap in the guard itself, not a false
# pass on those specific pages.
#
# So this checks every STATIC (non-dynamic-segment) page's FULL route
# against every source file in the admin app — the sidebar included —
# for a literal reference: '/route', "/route" or `/route` (optionally
# followed by ?, #, or another quote/backtick closing it). A dynamic
# route ([id], [companyId], ...) is excluded: it is reached at runtime
# from a list or a parent's own tabs with a computed path, never a
# literal string this check could find — the same reason
# portalPagesLinked.test.ts (the portal's equivalent of this script)
# excludes them for the portal.
#
# This is not a thing typechecking or a build can see: an unlinked
# page compiles and renders perfectly. So it needs its own check.
#
# A route legitimately reachable no other way goes in ALLOWED below,
# with a reason. The list is meant to stay short. (Checked: none
# needed today — even /dashboard, rendered as the standalone top-level
# link above the NAV_GROUPs, appears as a literal '/dashboard' string
# in AdminSidebar.tsx, so it needs no special case.)
set -euo pipefail

cd "$(dirname "$0")/.."

ADMIN_APP="admin/src/app/(admin)"
ADMIN_SRC="admin/src"

ALLOWED=(
  # /clients/new is a retired page kept only as a redirect to
  # /clients/onboard, for old bookmarks/deep-links. It deliberately has
  # no live link anywhere in the app — that is the whole point of it.
  "clients/new"
)

fail=0
checked=0

while IFS= read -r -d '' page; do
  route_dir="$(dirname "$page")"
  route="/${route_dir#"$ADMIN_APP/"}"

  # A dynamic segment is reached at runtime with a computed path, never
  # a literal string this check could find.
  case "$route" in *'['*) continue ;; esac

  skip=0
  for a in "${ALLOWED[@]:-}"; do
    if [ "$route" = "/$a" ]; then skip=1; break; fi
  done
  [ "$skip" -eq 1 ] && continue

  checked=$((checked + 1))

  esc="$(printf '%s' "$route" | sed -e 's/[.[\*^$]/\\&/g')"
  pattern="['\"\`]${esc}(['\"\`?#])"

  if grep -rlE "$pattern" "$ADMIN_SRC" --include='*.tsx' --include='*.ts' 2>/dev/null \
       | grep -v "^${route_dir}/" \
       | grep -v '/__tests__/' \
       | grep -q .; then
    continue
  fi

  echo "UNLINKED: $route has a page but no link anywhere in the admin app"
  echo "          Add a link (sidebar, tab, button, redirect), or add it to"
  echo "          ALLOWED in $0 with a reason."
  fail=1
done < <(find "$ADMIN_APP" -name 'page.tsx' -print0)

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "OK: every admin route with a page is reachable from somewhere in the app ($checked pages)."
