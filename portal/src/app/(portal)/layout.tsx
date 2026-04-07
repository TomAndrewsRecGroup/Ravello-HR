import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import PortalShell from '@/components/layout/PortalShell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, companyId, isTpsStaff, featureFlags } = await getSessionProfile();

  if (!user) redirect('/auth/login');
  if (!profile && !isTpsStaff) redirect('/auth/login?reason=no-profile');
  if (profile && (profile as any).onboarding_completed === false && !isTpsStaff) {
    redirect('/onboarding');
  }

  // Feature flags come from the session cookie — no DB call needed.
  // Middleware stamps them every 15 minutes.
  const flags = (isTpsStaff && !companyId) ? {} : featureFlags;
  const uiPreferences = (profile as any)?.ui_preferences ?? {};

  return (
    <PortalShell flags={flags} counts={{}} userId={user.id} companyId={companyId} uiPreferences={uiPreferences}>
      {children}
    </PortalShell>
  );
}
