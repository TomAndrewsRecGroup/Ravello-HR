import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import OnboardWizard from './OnboardWizard';

export const metadata: Metadata = { title: 'Onboard New Client' };

export default async function OnboardPage() {
  const supabase = createServerSupabaseClient();

  // Get TPS staff for account owner dropdown
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['tps_admin', 'tps_client'])
    .order('full_name');

  return (
    <>
      <AdminTopbar title="Onboard New Client" subtitle="Step-by-step client setup wizard" />
      <main className="admin-page flex-1 flex items-start justify-center">
        <OnboardWizard staff={staff ?? []} />
      </main>
    </>
  );
}
