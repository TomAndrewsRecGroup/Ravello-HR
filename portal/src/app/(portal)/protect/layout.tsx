import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

const TABS = [
  { href: '/protect/actions',       label: 'Actions' },
  { href: '/protect/compliance',    label: 'Compliance' },
  { href: '/protect/absence',       label: 'Absence' },
  { href: '/protect/employee-docs', label: 'Employee Docs' },
  { href: '/protect/offboarding',   label: 'Offboarding' },
  { href: '/protect/hr-dashboard',  label: 'HR Dashboard' },
  { href: '/protect/reports',       label: 'Reports' },
];

export default async function ProtectLayout({ children }: { children: React.ReactNode }) {
  // Hide tabs for modules this client does not have — the middleware
  // would only bounce the click back to the dashboard.
  const flags = await currentModuleFlags();
  const tabs = TABS.filter(t => isRouteEnabled(t.href, flags));
  return (
    <>
      <Topbar title="PROTECT" subtitle="Actions, compliance and reporting" />
      <SectionTabs tabs={tabs} />
      {children}
    </>
  );
}
