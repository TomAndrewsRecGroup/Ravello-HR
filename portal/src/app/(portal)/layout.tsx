import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let flags: Record<string, boolean> = {};

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed, company_id, companies(feature_flags)')
      .eq('id', user.id)
      .single();

    if (profile && (profile as any).onboarding_completed === false) {
      redirect('/onboarding');
    }

    flags = (profile as any)?.companies?.feature_flags ?? {};
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar flags={flags} />
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {children}
      </div>
    </div>
  );
}
