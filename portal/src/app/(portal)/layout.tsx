import Sidebar from '@/components/layout/Sidebar';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {children}
      </div>
    </div>
  );
}
