'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { seg: string; label: string }[] = [
  { seg: 'register',   label: 'Register' },
  { seg: 'documents',  label: 'Documents' },
  { seg: 'evidence',   label: 'Evidence' },
  { seg: 'activities', label: 'Activities' },
  { seg: 'audits',     label: 'Audits' },
  { seg: 'incidents',  label: 'Incidents' },
  { seg: 'incident-patterns', label: 'Incident Patterns' },
  { seg: 'equipment',  label: 'Equipment' },
  { seg: 'contractors', label: 'Contractors' },
  { seg: 'permits',    label: 'Permits' },
  { seg: 'isolations', label: 'Isolations' },
  { seg: 'emergency-plans', label: 'Emergency Plans' },
  { seg: 'environmental-aspects', label: 'Environmental Aspects' },
  { seg: 'environmental-spills', label: 'Spills' },
  { seg: 'environmental-waste', label: 'Waste' },
  { seg: 'environmental-monitoring', label: 'Monitoring' },
  { seg: 'environmental-permits', label: 'Env. Permits' },
  { seg: 'iso',        label: 'ISO Readiness' },
  { seg: 'legal',      label: 'Legal Register' },
  { seg: 'objectives', label: 'Objectives' },
  { seg: 'management-review', label: 'Management Review' },
  { seg: 'audit-programmes', label: 'Audit Programmes' },
  { seg: 'risk-graph', label: 'Risk Graph' },
  { seg: 'consultation', label: 'Consultation' },
  { seg: 'environmental-complaints', label: 'Complaints' },
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
