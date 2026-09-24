import Topbar from '@/components/layout/Topbar';
import GroupedTabs from '@/components/layout/GroupedTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

const TAB_GROUPS = [
  {
    label: 'People',
    tabs: [
      { href: '/lead/employee-records', label: 'Employees' },
      { href: '/lead/org-chart',        label: 'Org Chart' },
      { href: '/lead/onboarding',       label: 'Onboarding' },
    ],
  },
  {
    label: 'Docs',
    tabs: [
      { href: '/lead/documents',              label: 'Documents' },
      { href: '/lead/policy-acknowledgements', label: 'Sign-off' },
    ],
  },
  {
    label: 'Develop',
    tabs: [
      { href: '/lead/learning',   label: 'Learning' },
      { href: '/lead/hr-reports', label: 'Reports' },
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
      <Topbar title="LEAD" subtitle="People, documents and development" />
      <GroupedTabs groups={groups} />
      {children}
    </>
  );
}
