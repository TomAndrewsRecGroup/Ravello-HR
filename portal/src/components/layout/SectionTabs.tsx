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
    <div
      className="flex items-center gap-1 px-6 -mb-px"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      {tabs.map(tab => {
        const active = tab.href === current;
        return (
          <Link prefetch={false}
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="px-4 py-2.5 text-sm font-medium transition-colors"
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
