#!/usr/bin/env bash
# Every admin page must be reachable from the sidebar.
#
# Three finished pages were not. /candidates (the cross-client candidate
# list with screening scores), /feature-flags (per-client module
# toggles) and /roadmap had no link from anywhere in the app — the only
# way to reach them was to type the URL. Nothing failed, nothing warned;
# they were simply invisible, and /feature-flags is an operational
# control the admin needs.
#
# This is not a thing typechecking or a build can see: an unlinked page
# compiles and renders perfectly. So it needs its own check.
#
# A route legitimately outside the sidebar goes in ALLOWED below, with a
# reason. The list is meant to stay short.
set -euo pipefail

cd "$(dirname "$0")/.."

ADMIN_APP="admin/src/app/(admin)"
SIDEBAR="admin/src/components/layout/AdminSidebar.tsx"

# Routes deliberately not in a NAV_GROUP.
#   dashboard — rendered as the standalone top-level link above the groups
ALLOWED="dashboard"

fail=0

for dir in "$ADMIN_APP"/*/; do
  route="$(basename "$dir")"

  # A directory with no page.tsx anywhere below it is not a route.
  if [ -z "$(find "$dir" -name 'page.tsx' -print -quit)" ]; then continue; fi

  case " $ALLOWED " in *" $route "*) continue ;; esac

  # Linked if the sidebar names /<route> exactly or as a path prefix.
  if grep -qE "href: '/$route(/|')" "$SIDEBAR"; then continue; fi

  echo "UNLINKED: /$route has a page but no sidebar entry in $SIDEBAR"
  echo "          Add it to a NAV_GROUP, or to ALLOWED in $0 with a reason."
  fail=1
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi

n=$(find "$ADMIN_APP" -mindepth 2 -name 'page.tsx' | wc -l | tr -d ' ')
echo "OK: every admin route with a page is reachable from the sidebar ($n pages)."
