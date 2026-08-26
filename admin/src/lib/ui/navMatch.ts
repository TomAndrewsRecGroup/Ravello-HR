/**
 * Which sidebar item is the current page?
 *
 * Extracted from AdminSidebar so it can be tested. The version that
 * lived inline had two demonstrable defects, both caused by matching
 * each item independently instead of asking which item wins:
 *
 *   const active = path === item.href
 *     || (path.startsWith(item.href) && item.href !== '/clients');
 *
 * 1. On /hiring/templates BOTH "Roles" (/hiring) and "Templates"
 *    (/hiring/templates) highlighted, because a prefix test cannot
 *    know a longer item also matched.
 * 2. On /clients/<id> NOTHING highlighted. The `!== '/clients'` clause
 *    was added to stop defect 1 on the Clients group, and it worked by
 *    removing /clients from prefix matching altogether — so every
 *    client detail page lost its sidebar position. Worse, the group
 *    header used a different expression with no such exclusion, so the
 *    header went purple while every item under it stayed grey.
 *
 * The fix is to resolve one winner across ALL groups. Longest match
 * wins, so a more specific item always beats its parent and no
 * exclusion list is needed.
 */

/**
 * True when `path` is `href` or sits beneath it, respecting segment
 * boundaries.
 *
 * The boundary check is the point. A bare `startsWith` matches
 * '/reports-archive' against '/reports', which is a latent bug the
 * current route names happen to avoid — right up until somebody adds a
 * route whose name extends an existing one.
 */
export function isUnder(path: string, href: string): boolean {
  return path === href || path.startsWith(href + '/');
}

/**
 * The single href that should render as active, or null when the path
 * belongs to no navigation item.
 *
 * Pass every item's href from every group. Resolving per-group would
 * reintroduce defect 1 across groups: a short href in one group could
 * win there while a longer href in another group also matched.
 */
export function activeHref(path: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!isUnder(path, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
