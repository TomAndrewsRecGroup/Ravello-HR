import Topbar from '@/components/layout/Topbar';
import GroupedTabs from '@/components/layout/GroupedTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

// Absence, employee documents, offboarding and the HR dashboard moved
// here from PROTECT on 2026-09-24, when PROTECT became Health & Safety.
const TAB_GROUPS = [
  {
    label: 'People',
    tabs: [
      { href: '/lead/employee-records', label: 'Employees' },
      { href: '/lead/org-chart',        label: 'Org Chart' },
      { href: '/lead/onboarding',       label: 'Onboarding' },
      { href: '/lead/offboarding',      label: 'Offboarding' },
      { href: '/lead/absence',          label: 'Absence' },
    ],
  },
  {
    label: 'Docs',
    tabs: [
      { href: '/lead/documents',               label: 'Documents' },
      { href: '/lead/employee-docs',           label: 'Employee Docs' },
      { href: '/lead/policy-acknowledgements', label: 'Sign-off' },
    ],
  },
  {
    label: 'Develop',
    tabs: [
      { href: '/lead/learning',   label: 'Learning' },
      { href: '/lead/training',   label: 'Development needs' },
      { href: '/lead/reviews',    label: 'Reviews' },
      { href: '/lead/skills',     label: 'Skills' },
      { href: '/lead/roadmap',    label: 'Roadmap' },
    ],
  },
  {
    label: 'Insight',
    tabs: [
      { href: '/lead/hr-dashboard', label: 'HR Dashboard' },
      { href: '/lead/hr-reports',   label: 'Reports' },
    ],
  },
];

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  // Hide tabs for modules this client does not have — the middleware
  // would only bounce the click back to the dashboard.
  const flags = await currentModuleFlags();
  const groups = TAB_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => isRouteEnabled(t.href, flags)) }))
    .filter(g => g.tabs.length > 0);
  return (
    <>
      <Topbar title="LEAD" subtitle="People, HR, documents and development" />
      <GroupedTabs groups={groups} />
      {children}
    </>
  );
}
