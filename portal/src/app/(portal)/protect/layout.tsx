import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

// PROTECT is Health & Safety (2026-09-24). The HR pages that used to
// live here (absence, employee documents, offboarding, the HR
// dashboard) are under LEAD now; their old addresses redirect.
const TABS = [
  { href: '/protect',            label: 'Overview' },
  { href: '/protect/compliance', label: 'Register' },
  { href: '/protect/documents',  label: 'Documents' },
  { href: '/protect/audits',     label: 'Audits' },
  { href: '/protect/actions',    label: 'Actions' },
  { href: '/protect/timeline',   label: 'Timeline' },
  { href: '/protect/reports',    label: 'Reports' },
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
