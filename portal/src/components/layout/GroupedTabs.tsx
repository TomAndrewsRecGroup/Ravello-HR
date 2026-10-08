'use client';
import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab { href: string; label: string; }
interface TabGroup { label: string; tabs: Tab[]; }

export default function GroupedTabs({ groups }: { groups: TabGroup[] }) {
  const path = usePathname();
  // One winner, the longest matching tab, across EVERY group — the
  // same fix SectionTabs already applies: an index tab such as
  // /protect (Overview) or /lead/workforce (Safe to Deploy) is a
  // PREFIX of several other tabs' own hrefs and would otherwise light
  // up alongside whichever one is actually open.
  const allTabs = groups.flatMap(g => g.tabs);
  const current = allTabs
    .filter(t => path === t.href || path.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div
      className="flex flex-wrap items-center gap-x-0.5 gap-y-1 px-3 sm:px-5 py-1 sm:py-0"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      {groups.map((group, gi) => (
        <Fragment key={group.label}>
          {gi > 0 && (
            <div className="w-px h-4 mx-2 shrink-0" style={{ background: 'var(--line)' }} />
          )}
          {/* A group's own tabs wrap INSIDE its box, not just the
              outer bar — a large cluster (e.g. Intelligence's 9 tabs)
              is wider than a phone viewport on one line; without this
              the box would overflow sideways instead of wrapping, the
              exact "clipped past the edge" failure mode this whole
              component exists to avoid (that's what SectionTabs' own
              horizontal scroll already did, invisibly, which is why
              this component wraps instead). The label stays visible
              at every width (never hidden below a breakpoint) so the
              cluster it names is never reduced to an unlabelled run of
              links separated only by a thin divider on a small screen —
              exactly the grouping signal this component exists to show. */}
          <div className="flex flex-wrap items-center gap-y-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider mr-1.5 shrink-0" style={{ color: 'var(--ink-faint)' }}>
              {group.label}
            </span>
            {group.tabs.map(tab => {
              const active = tab.href === current;
              return (
                <Link prefetch={false}
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className="px-3 py-2.5 text-[13px] font-medium transition-colors whitespace-nowrap"
                  style={{
                    color: active ? 'var(--purple)' : 'var(--ink-faint)',
                    borderBottom: active ? '2px solid var(--purple)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
