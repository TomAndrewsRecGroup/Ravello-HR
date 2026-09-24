import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ADMIN_ROLE_COOKIE, verifyAdminRole } from '@/lib/auth/adminRoleCookie';
import { PROVIDER_ROLE, STAFF_ROLE } from '@/lib/auth/rolePaths';
import { ToastProvider } from '@/components/modules/Toast';
import HsShell from '@/components/hs/HsShell';
import type { HsMyCompany } from '@/lib/hs/types';

// The Health & Safety workspace, for Core OS 360 staff AND external
// providers (hs_provider, migration 094).
//
// A second gate, not a copy of the middleware's: it binds the cached
// role to getUser() itself and admits only the two roles that belong
// here. It does NOT render the staff shell — AdminSidebar and the
// (admin) layout's client list read with the service role, and nothing
// a provider can reach may do that (noServiceRoleInHs.test.ts).
//
// Which clients appear is decided by the database: hs_my_companies()
// returns every active client for staff, and only a provider's live
// assignments for a provider. Every page under here reads with this
// user's own session, so RLS scopes each row the same way.
export default async function HsLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?reason=no-session');

  const cached = await verifyAdminRole(cookies().get(ADMIN_ROLE_COOKIE)?.value, user.id);
  let role = cached?.role ?? null;
  if (role !== STAFF_ROLE && role !== PROVIDER_ROLE) {
    const { data } = await supabase.rpc('get_my_role');
    role = typeof data === 'string' ? data : null;
  }
  if (role !== STAFF_ROLE && role !== PROVIDER_ROLE) redirect('/auth/login?reason=unauthorised');

  const [{ data: companies }, { data: provider }] = await Promise.all([
    supabase.rpc('hs_my_companies'),
    role === PROVIDER_ROLE
      ? supabase.from('hs_providers').select('name').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <ToastProvider>
      <HsShell
        companies={(companies ?? []) as HsMyCompany[]}
        isStaff={role === STAFF_ROLE}
        providerName={(provider as { name?: string } | null)?.name ?? null}
        userEmail={user.email ?? ''}
      >
        {children}
      </HsShell>
    </ToastProvider>
  );
}
