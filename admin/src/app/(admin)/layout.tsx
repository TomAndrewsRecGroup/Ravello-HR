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

  // Use SECURITY DEFINER function to bypass RLS circular dependency
  const { data: rpcRole } = await supabase.rpc('get_my_role');
  const role = typeof rpcRole === 'string' ? rpcRole : '';
  if (!['tps_admin', 'tps_client'].includes(role)) {
    // Sign out to prevent redirect loop (middleware would redirect back here)
    await supabase.auth.signOut();
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
