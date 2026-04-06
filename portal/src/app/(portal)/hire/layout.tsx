import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';

const TABS = [
  { href: '/hire/hiring',        label: 'Hiring' },
  { href: '/hire/internal',      label: 'Internal Roles' },
  { href: '/hire/cost-modeller', label: 'Cost Modeller' },
  { href: '/hire/vacancy-cost',  label: 'Vacancy Cost' },
  { href: '/hire/friction-lens', label: 'Friction Lens' },
  { href: '/hire/metrics',       label: 'Metrics' },
  { href: '/hire/benchmarks',    label: 'Benchmarks' },
];

export default function HireLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar title="HIRE" subtitle="Recruitment, friction analysis and benchmarking" />
      <SectionTabs tabs={TABS} />
      {children}
    </>
  );
}
