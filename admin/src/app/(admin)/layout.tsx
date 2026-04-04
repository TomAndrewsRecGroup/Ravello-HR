import AdminSidebar from '@/components/layout/AdminSidebar';
import { MobileMenuProvider } from '@/components/layout/MobileMenuContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileMenuProvider>
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div
          className="main-content flex-1 flex flex-col min-h-screen"
          style={{ marginLeft: 'var(--sidebar-w)' }}
        >
          {children}
        </div>
      </div>
    </MobileMenuProvider>
  );
}
