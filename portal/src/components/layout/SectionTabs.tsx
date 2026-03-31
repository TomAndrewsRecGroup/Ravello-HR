'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  href: string;
  label: string;
}

export default function SectionTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();

  return (
    <div
      className="flex items-center gap-1 px-6 -mb-px"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      {tabs.map(tab => {
        const active = path === tab.href || path.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
