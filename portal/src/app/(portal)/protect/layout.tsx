import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';

const TABS = [
  { href: '/protect/actions',      label: 'Actions' },
  { href: '/protect/compliance',   label: 'Compliance' },
  { href: '/protect/offboarding',  label: 'Offboarding' },
  { href: '/protect/reports',      label: 'Reports' },
];

export default function ProtectLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar title="PROTECT" subtitle="Actions, compliance and reporting" />
      <SectionTabs tabs={TABS} />
      {children}
    </>
  );
}
