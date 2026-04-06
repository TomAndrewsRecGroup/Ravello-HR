import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import PortalShell from '@/components/layout/PortalShell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, companyId, isTpsStaff } = await getSessionProfile();

  if (!user) redirect('/auth/login');
  if (!profile && !isTpsStaff) redirect('/auth/login?reason=no-profile');
  if (profile && (profile as any).onboarding_completed === false && !isTpsStaff) {
    redirect('/onboarding');
  }

  // Only fetch feature flags (required for sidebar rendering).
  // Badge counts are fetched client-side by the Sidebar to avoid blocking page load.
  let flags: Record<string, boolean> = {};
  const uiPreferences = (profile as any)?.ui_preferences ?? {};

  if (isTpsStaff && !companyId) {
    flags = {};
  } else if (companyId) {
    const supabase = createServerSupabaseClient();
    const { data: company } = await supabase
      .from('companies').select('feature_flags').eq('id', companyId).single();
    flags = (company as any)?.feature_flags ?? {};
  }

  return (
    <PortalShell flags={flags} counts={{}} userId={user.id} companyId={companyId} uiPreferences={uiPreferences}>
      {children}
    </PortalShell>
  );
}
