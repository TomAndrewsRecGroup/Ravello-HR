import Topbar from '@/components/layout/Topbar';

export default function DevPlansLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar title="Development Plans" subtitle="Branded plans assigned by The People System" />
      {children}
    </>
  );
}
