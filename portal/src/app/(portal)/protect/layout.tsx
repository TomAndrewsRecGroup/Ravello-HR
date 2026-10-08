import Topbar from '@/components/layout/Topbar';
import GroupedTabs from '@/components/layout/GroupedTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

// PROTECT is Health & Safety (2026-09-24). The HR pages that used to
// live here (absence, employee documents, offboarding, the HR
// dashboard) are under LEAD now; their old addresses redirect.
//
// Grouped, not a single flat row (2026-10-08): 41 tabs in one
// SectionTabs row overflowed past the visible page on a laptop/tablet
// width — SectionTabs scrolls sideways with no visible affordance
// that there's more, so most of the section was invisible in
// practice. GroupedTabs (already proven on LEAD) wraps onto further
// lines instead and clusters related pages under one small header,
// which is also where "Investigations moves under the Incident tab
// as its own sub-tab" lives: it is grouped with Incidents/Actions
// below, not a free-floating peer of 40 other tabs.
const TAB_GROUPS: { label: string; tabs: { href: string; label: string }[] }[] = [
  {
    label: 'Overview',
    tabs: [
      { href: '/protect',                 label: 'Overview' },
      // Core 360 Status is the ONE "is this client OK" view (go-live
      // gap list, item 3, 2026-10-02) — Assurance Today, Digital Twin
      // and Board Assurance are sections ON this page now, not
      // separate tabs; their own routes still exist as plain
      // redirects here, for an old bookmark or sidebar link.
      { href: '/protect/core-360-status', label: 'Core 360 Status' },
    ],
  },
  {
    // The operational safety core (Phase 2).
    label: 'Risk Management',
    tabs: [
      { href: '/protect/hazards',          label: 'Hazards' },
      { href: '/protect/risk-assessments', label: 'Risk Assessments' },
      { href: '/protect/rams',             label: 'RAMS' },
      { href: '/protect/coshh',            label: 'COSHH' },
    ],
  },
  {
    label: 'Incidents',
    tabs: [
      { href: '/protect/incidents',        label: 'Incidents' },
      { href: '/protect/investigations',   label: 'Investigations' },
      { href: '/protect/actions',          label: 'Actions' },
    ],
  },
  {
    // The register and records Core OS 360 keeps on the client's behalf.
    label: 'Register',
    tabs: [
      { href: '/protect/compliance',       label: 'Register' },
      { href: '/protect/audits',           label: 'Audits' },
      { href: '/protect/equipment',        label: 'Equipment' },
      { href: '/protect/tests',            label: 'Tests' },
      { href: '/protect/documents',        label: 'Documents' },
    ],
  },
  {
    label: 'Emergency & Contractors',
    tabs: [
      { href: '/protect/emergency-plans',  label: 'Emergency Plans' },
      { href: '/protect/contractors',      label: 'Contractors' },
      { href: '/protect/permits',          label: 'Permits' },
      { href: '/protect/isolations',       label: 'Isolations' },
    ],
  },
  {
    label: 'Environmental',
    tabs: [
      { href: '/protect/environmental-aspects',    label: 'Aspects' },
      { href: '/protect/environmental-spills',     label: 'Spills' },
      { href: '/protect/environmental-waste',      label: 'Waste' },
      { href: '/protect/environmental-monitoring', label: 'Monitoring' },
      { href: '/protect/environmental-permits',    label: 'Env. Permits' },
      { href: '/protect/environmental-complaints', label: 'Complaints' },
    ],
  },
  {
    label: 'Governance',
    tabs: [
      { href: '/protect/iso-readiness',     label: 'ISO Readiness' },
      { href: '/protect/legal-register',    label: 'Legal Register' },
      { href: '/protect/objectives',        label: 'Objectives' },
      { href: '/protect/management-review', label: 'Management Review' },
      { href: '/protect/audit-programmes',  label: 'Audit Programmes' },
      { href: '/protect/consultation',      label: 'Consultation' },
    ],
  },
  {
    label: 'Intelligence',
    tabs: [
      { href: '/protect/risk-graph',               label: 'Risk Graph' },
      { href: '/protect/critical-controls',        label: 'Critical Controls' },
      { href: '/protect/incident-patterns',        label: 'Incident Patterns' },
      { href: '/protect/continuous-improvement',   label: 'Continuous Improvement' },
      { href: '/protect/operational-exceptions',   label: 'Operational Exceptions' },
      { href: '/protect/evidence',                 label: 'Evidence' },
      { href: '/protect/lessons-learned',          label: 'Lessons Learned' },
      { href: '/protect/what-changed',             label: 'What Changed' },
      { href: '/protect/analysis',                 label: 'Analysis' },
    ],
  },
  {
    label: 'Reports',
    tabs: [
      { href: '/protect/timeline', label: 'Timeline' },
      { href: '/protect/reports',  label: 'Reports' },
    ],
  },
];

export default async function ProtectLayout({ children }: { children: React.ReactNode }) {
  // Hide tabs for modules this client does not have — the middleware
  // would only bounce the click back to the dashboard.
  const flags = await currentModuleFlags();
  const groups = TAB_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => isRouteEnabled(t.href, flags)) }))
    .filter(g => g.tabs.length > 0);
  return (
    <>
      <Topbar title="PROTECT · Health & Safety" subtitle="Your register, safety record and the people who look after it" />
      <GroupedTabs groups={groups} />
      {children}
    </>
  );
}
