import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import AdminSidebar from '@/components/layout/AdminSidebar';
import { MobileMenuProvider } from '@/components/layout/MobileMenuContext';
import { ClientSwitcherProvider } from '@/components/layout/ClientSwitcher';
import { ToastProvider } from '@/components/modules/Toast';
import BrandIntro from '@/components/brand/BrandIntro';
import { BRAND_INTRO_COOKIE } from '@/lib/brand';
import { ADMIN_ROLE_COOKIE, verifyAdminRole } from '@/lib/auth/adminRoleCookie';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
  // Middleware already validates auth + role and caches it in a SIGNED
  // tpo_admin_role cookie (lib/auth/adminRoleCookie.ts). This is the
  // second gate, not a copy of the first: it must hold on its own for
  // any request the middleware did not see. So the cookie is accepted
  // only for the user whose session this is (getUser verifies the JWT),
  // and anything else falls back to the RPC. It never trusts the raw
  // value, which any signed-in user could set by hand until 2026-09-24.
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?reason=no-session');
  const cached = await verifyAdminRole(cookieStore.get(ADMIN_ROLE_COOKIE)?.value, user.id);
  let isStaff = !!cached && ALLOWED_ROLES.includes(cached.role);
  if (!isStaff) {
    const { data: role } = await supabase.rpc('get_my_role');
    isStaff = typeof role === 'string' && ALLOWED_ROLES.includes(role);
  }
  if (!isStaff) {
    redirect('/auth/login?reason=unauthorised');
  }

  const initialCompanies = await fetchActiveCompanies();
  const playIntro = cookieStore.get(BRAND_INTRO_COOKIE)?.value === '1';

  return (
    <MobileMenuProvider>
      <ClientSwitcherProvider initialCompanies={initialCompanies}>
        <ToastProvider>
          {playIntro && <BrandIntro />}
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
