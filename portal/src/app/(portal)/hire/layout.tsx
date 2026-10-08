import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';
import { HIRE_TABS as TABS } from '@/lib/hire/tabs';

export default async function HireLayout({ children }: { children: React.ReactNode }) {
  // Hide tabs for modules this client does not have — the middleware
  // would only bounce the click back to the dashboard.
  const flags = await currentModuleFlags();
  const tabs = TABS.filter(t => isRouteEnabled(t.href, flags));
  return (
    <>
      <Topbar title="HIRE" subtitle="Recruitment, friction analysis and benchmarking" />
      <SectionTabs tabs={tabs} />
      {children}
    </>
  );
}
