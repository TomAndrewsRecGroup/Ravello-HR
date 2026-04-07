import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import AdminSidebar from '@/components/layout/AdminSidebar';
import { MobileMenuProvider } from '@/components/layout/MobileMenuContext';
import { ClientSwitcherProvider } from '@/components/layout/ClientSwitcher';
import { ToastProvider } from '@/components/modules/Toast';

const ALLOWED_ROLES = ['tps_admin', 'tps_client'];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware already validates auth + role and caches in tpo_admin_role cookie.
  // Reading the cookie avoids 2 redundant DB calls (getUser + get_my_role) per page load.
  const cookieStore = cookies();
  const cachedRole = cookieStore.get('tpo_admin_role')?.value;

  if (!cachedRole || !ALLOWED_ROLES.includes(cachedRole)) {
    redirect('/auth/login?reason=unauthorised');
  }

  return (
    <MobileMenuProvider>
      <ClientSwitcherProvider>
        <ToastProvider>
          <div className="flex min-h-screen">
            <AdminSidebar />
            <div
              className="main-content flex-1 flex flex-col min-h-screen"
              style={{ marginLeft: 'var(--sidebar-w)' }}
            >
              {children}
            </div>
          </div>
        </ToastProvider>
      </ClientSwitcherProvider>
    </MobileMenuProvider>
  );
}
