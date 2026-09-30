import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

// PROTECT is Health & Safety (2026-09-24). The HR pages that used to
// live here (absence, employee documents, offboarding, the HR
// dashboard) are under LEAD now; their old addresses redirect.
const TABS = [
  // The operational safety core (Phase 2), in the order work flows.
  { href: '/protect',                  label: 'Overview' },
  { href: '/protect/hazards',          label: 'Hazards' },
  { href: '/protect/risk-assessments', label: 'Risk Assessments' },
  { href: '/protect/rams',             label: 'RAMS' },
  { href: '/protect/coshh',            label: 'COSHH' },
  { href: '/protect/incidents',        label: 'Incidents' },
  { href: '/protect/investigations',   label: 'Investigations' },
  { href: '/protect/actions',          label: 'Actions' },
  // The register and records Core OS 360 keeps on the client's behalf.
  { href: '/protect/compliance',       label: 'Register' },
  { href: '/protect/audits',           label: 'Audits' },
  { href: '/protect/equipment',        label: 'Equipment' },
  { href: '/protect/emergency-plans',  label: 'Emergency Plans' },
  { href: '/protect/contractors',      label: 'Contractors' },
  { href: '/protect/permits',          label: 'Permits' },
  { href: '/protect/isolations',       label: 'Isolations' },
  { href: '/protect/environmental-aspects', label: 'Environmental Aspects' },
  { href: '/protect/environmental-spills', label: 'Spills' },
  { href: '/protect/environmental-waste', label: 'Waste' },
  { href: '/protect/environmental-monitoring', label: 'Monitoring' },
  { href: '/protect/environmental-permits', label: 'Env. Permits' },
  { href: '/protect/iso-readiness',    label: 'ISO Readiness' },
  { href: '/protect/legal-register',   label: 'Legal Register' },
  { href: '/protect/objectives',       label: 'Objectives' },
  { href: '/protect/management-review', label: 'Management Review' },
  { href: '/protect/audit-programmes', label: 'Audit Programmes' },
  { href: '/protect/consultation',     label: 'Consultation' },
  { href: '/protect/environmental-complaints', label: 'Complaints' },
  { href: '/protect/documents',        label: 'Documents' },
  { href: '/protect/tests',            label: 'Tests' },
  { href: '/protect/timeline',         label: 'Timeline' },
  { href: '/protect/risk-graph',       label: 'Risk Graph' },
  { href: '/protect/incident-patterns', label: 'Incident Patterns' },
  { href: '/protect/evidence',         label: 'Evidence' },
  { href: '/protect/assurance',        label: 'Assurance Today' },
  { href: '/protect/digital-twin',     label: 'Digital Twin' },
  { href: '/protect/board-assurance',  label: 'Board Assurance' },
  { href: '/protect/lessons-learned',  label: 'Lessons Learned' },
  { href: '/protect/analysis',         label: 'Analysis' },
  { href: '/protect/reports',          label: 'Reports' },
];

export default async function ProtectLayout({ children }: { children: React.ReactNode }) {
  // Hide tabs for modules this client does not have — the middleware
  // would only bounce the click back to the dashboard.
  const flags = await currentModuleFlags();
  const tabs = TABS.filter(t => isRouteEnabled(t.href, flags));
  return (
    <>
      <Topbar title="PROTECT · Health & Safety" subtitle="Your register, safety record and the people who look after it" />
      <SectionTabs tabs={tabs} />
      {children}
    </>
  );
}
