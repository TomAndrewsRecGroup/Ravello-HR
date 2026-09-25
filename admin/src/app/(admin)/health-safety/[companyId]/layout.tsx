import { notFound } from 'next/navigation';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import HsCompanyTabs from '@/components/hs/HsCompanyTabs';

// One client's H&S workspace, inside the normal admin shell — staff see
// every client, so a bad id is a 404, not an empty page.
export default async function HealthSafetyCompanyLayout({
  children, params,
}: { children: React.ReactNode; params: { companyId: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: company } = await supabase.from('companies').select('id, name').eq('id', params.companyId).maybeSingle();
  if (!company) notFound();

  return (
    <>
      <AdminTopbar title={(company as { name: string }).name} subtitle="Health & Safety" />
      <main className="admin-page flex-1 space-y-5">
        <HsCompanyTabs companyId={params.companyId} />
        {children}
      </main>
    </>
  );
}
