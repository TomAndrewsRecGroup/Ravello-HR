import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

const TABS = [
  { href: '/hire/hiring',        label: 'Hiring' },
  { href: '/hire/internal',      label: 'Internal Roles' },
  { href: '/hire/cost-modeller', label: 'Cost Modeller' },
  { href: '/hire/vacancy-cost',  label: 'Vacancy Cost' },
  { href: '/hire/friction-lens', label: 'Friction Lens' },
  { href: '/hire/metrics',       label: 'Metrics' },
  { href: '/hire/benchmarks',    label: 'Benchmarks' },
];

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
