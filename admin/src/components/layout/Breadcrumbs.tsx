'use client';

// Breadcrumbs derived from the route.
//
// Neither app had a single breadcrumb — the marketing site has them on
// 16 pages while the product had none. Admin staff work across clients
// all day, and landing on a requisition from a notification with no
// visible parent forces a mental reconstruction of where you are every
// time.
//
// Rendered inside the topbar, which is already on every page, so this
// covers all 46 admin routes with one change rather than 46 edits.
//
// Every segment except the last is a real link. A breadcrumb you cannot
// click is decoration.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

/** Segments that are structural rather than navigable — a bare /clients
 *  is a real page, but /settings on its own is not. */
const NOT_A_PAGE = new Set(['settings']);

/** Route segments whose default title-casing reads wrong. */
const LABELS: Record<string, string> = {
  'bd-intelligence':     'BD Intelligence',
  'bd-roles':            'BD Roles',
  'dev-plans':           'Development Plans',
  'athletes-to-industry':'Athletes To Industry',
  'value-reports':       'Value Reports',
  'salary-benchmarks':   'Salary Benchmarks',
  'latest-updates':      'Latest Updates',
  'jd-templates':        'JD Templates',
  'hiring':              'Roles',
  'new':                 'New',
};

function titleCase(seg: string): string {
  return LABELS[seg] ?? seg
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** A path segment that is an id rather than a name. */
function isIdSegment(seg: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^\d+$/.test(seg);
}

interface Props {
  /** Name for the current record, used in place of a raw id — the
   *  difference between "Clients › 3f2a…" and "Clients › Tarmac". */
  currentLabel?: string;
  /** Root link. Both apps land on /dashboard. */
  homeHref?: string;
}

export default function Breadcrumbs({ currentLabel, homeHref = '/dashboard' }: Props) {
  const pathname = usePathname() ?? '';
  const segments = pathname.split('/').filter(Boolean);

  // The dashboard is the root — a single "Dashboard" crumb says nothing.
  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'dashboard')) {
    return null;
  }

  const crumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const isLast = i === segments.length - 1;
    const label = isIdSegment(seg)
      ? (currentLabel ?? 'Detail')
      : titleCase(seg);
    return { href, label, isLast, linkable: !NOT_A_PAGE.has(seg) && !isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1 min-w-0">
      <Link
        href={homeHref}
        className="focus-ring"
        style={{ fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        Dashboard
      </Link>
      {crumbs.map(c => (
        <span key={c.href} className="flex items-center gap-1 min-w-0">
          <ChevronRight size={12} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} aria-hidden="true" />
          {c.linkable ? (
            <Link
              href={c.href}
              className="focus-ring"
              style={{ fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              {c.label}
            </Link>
          ) : (
            <span
              aria-current={c.isLast ? 'page' : undefined}
              style={{
                fontSize: 12,
                color: c.isLast ? 'var(--ink-soft)' : 'var(--ink-faint)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 220,
              }}
            >
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
