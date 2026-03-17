import AdminSidebar from '@/components/layout/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: 'var(--sidebar-w)' }}>
        {children}
      </div>
    </div>
  );
}
