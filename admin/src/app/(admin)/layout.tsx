import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminSidebar from '@/components/layout/AdminSidebar';
import { MobileMenuProvider } from '@/components/layout/MobileMenuContext';
import { ClientSwitcherProvider } from '@/components/layout/ClientSwitcher';
import { ToastProvider } from '@/components/modules/Toast';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profile as any)?.role ?? '';
  if (!['tps_admin', 'tps_client'].includes(role)) {
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
