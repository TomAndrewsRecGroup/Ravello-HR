'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab { href: string; label: string; }
interface TabGroup { label: string; tabs: Tab[]; }

export default function GroupedTabs({ groups }: { groups: TabGroup[] }) {
  const path = usePathname();

  return (
    <div
      className="flex items-center gap-0.5 px-5 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      {groups.map((group, gi) => (
        <div key={group.label} className="flex items-center">
          {gi > 0 && (
            <div className="w-px h-4 mx-2" style={{ background: 'var(--line)' }} />
          )}
          <span className="text-[9px] font-semibold uppercase tracking-wider mr-1.5 hidden sm:inline" style={{ color: 'var(--ink-faint)' }}>
            {group.label}
          </span>
          {group.tabs.map(tab => {
            const active = path === tab.href || path.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
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
      ))}
    </div>
  );
}
