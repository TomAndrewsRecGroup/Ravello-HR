'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { seg: string; label: string }[] = [
  { seg: 'register',   label: 'Register' },
  { seg: 'documents',  label: 'Documents' },
  { seg: 'activities', label: 'Activities' },
  { seg: 'audits',     label: 'Audits' },
  { seg: 'incidents',  label: 'Incidents' },
  { seg: 'equipment',  label: 'Equipment' },
  { seg: 'kpis',       label: 'KPIs' },
  { seg: 'timeline',   label: 'Timeline' },
];

export default function HsCompanyTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--line)' }} aria-label="Client sections">
      {TABS.map(t => {
        const href = `/health-safety/${companyId}/${t.seg}`;
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
