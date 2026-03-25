import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single();

    if (profile && (profile as any).onboarding_completed === false) {
      redirect('/onboarding');
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {children}
      </div>
    </div>
  );
}
