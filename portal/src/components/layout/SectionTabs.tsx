'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  href: string;
  label: string;
}

export default function SectionTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  // One winner, the longest matching tab: a section index tab such as
  // /protect (Overview) is a prefix of every other tab and would
  // otherwise light up alongside whichever one is open.
  const current = tabs
    .filter(t => path === t.href || path.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    // Wraps onto further lines rather than scrolling sideways (2026-10-09):
    // HIRE's own 8 tabs (the only remaining user of this component — LEAD
    // and PROTECT both moved to GroupedTabs for the identical reason) are
    // wider than a phone viewport, and the old overflow-x-auto gave no
    // visible cue that more tabs existed off-screen — most of them were
    // effectively invisible in practice, the exact defect class PROTECT's
    // own 41-tab row already had. HIRE's tabs have no natural grouping to
    // reach for GroupedTabs' clustering, so the fix here is the narrower
    // half of that same lesson: wrap, don't silently scroll.
    <div
      className="no-print flex flex-wrap items-center gap-x-1 gap-y-1 px-6 py-1 -mb-px"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      {tabs.map(tab => {
        const active = tab.href === current;
        return (
          <Link prefetch={false}
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
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
  );
}
