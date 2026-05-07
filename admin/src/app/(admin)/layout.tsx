import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import AdminSidebar from '@/components/layout/AdminSidebar';
import { MobileMenuProvider } from '@/components/layout/MobileMenuContext';
import { ClientSwitcherProvider } from '@/components/layout/ClientSwitcher';
import { ToastProvider } from '@/components/modules/Toast';

const ALLOWED_ROLES = ['tps_admin'];

// Server-side fetch of the topbar client list. Cached for 60s with a
// shared 'companies-active' tag — admin client mutations
// (archive/unarchive/delete) revalidate the tag so the dropdown
// updates without a hard reload. Removes the post-mount client-side
// `companies?select=…` fetch + its CORS preflight (~70ms saved per
// page load, plus one fewer round-trip).
const fetchActiveCompanies = unstable_cache(
  async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return [];
    const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data } = await sb.from('companies').select('id, name').eq('active', true).order('name');
    return data ?? [];
  },
  ['admin-active-companies'],
  { revalidate: 60, tags: ['companies-active'] },
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware already validates auth + role and caches in tpo_admin_role cookie.
  // Reading the cookie avoids 2 redundant DB calls (getUser + get_my_role) per page load.
  const cookieStore = cookies();
  const cachedRole = cookieStore.get('tpo_admin_role')?.value;

  if (!cachedRole || !ALLOWED_ROLES.includes(cachedRole)) {
    redirect('/auth/login?reason=unauthorised');
  }

  const initialCompanies = await fetchActiveCompanies();

  return (
    <MobileMenuProvider>
      <ClientSwitcherProvider initialCompanies={initialCompanies}>
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
