'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { HsScope } from '@/lib/hs/vocab';

const TABS: { seg: string; label: string; scope: HsScope | null }[] = [
  { seg: 'register',   label: 'Register',   scope: 'register' },
  { seg: 'activities', label: 'Activities', scope: 'register' },
  { seg: 'timeline',   label: 'Timeline',   scope: null },
];

export default function HsCompanyTabs({ companyId, scopes }: { companyId: string; scopes: HsScope[] }) {
  const pathname = usePathname();
  const tabs = TABS.filter(t => !t.scope || scopes.includes(t.scope));
  return (
    <nav className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--line)' }} aria-label="Client sections">
      {tabs.map(t => {
        const href = `/hs/c/${companyId}/${t.seg}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.seg}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="px-3 py-2 text-sm font-medium whitespace-nowrap"
            style={{
              color: active ? 'var(--purple)' : 'var(--ink-soft)',
              borderBottom: active ? '2px solid var(--purple)' : '2px solid transparent',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
