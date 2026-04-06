import Topbar from '@/components/layout/Topbar';
import GroupedTabs from '@/components/layout/GroupedTabs';

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

export default function LeadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar title="LEAD" subtitle="People, documents and development" />
      <GroupedTabs groups={TAB_GROUPS} />
      {children}
    </>
  );
}
