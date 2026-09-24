import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HsAssignment, HsProvider, HsProviderLogin } from '@/lib/hs/types';
import ProvidersClient from './ProvidersClient';

export const metadata: Metadata = { title: 'H&S Providers' };
export const dynamic = 'force-dynamic';

// Staff only (the (admin) layout). External Health & Safety providers,
// the clients each one may work on and for which scopes, and the people
// at each provider who hold a login. Reads and writes here use the
// staff session; RLS (094) gives staff everything on these tables.
export default async function HsProvidersPage() {
  const supabase = createServerSupabaseClient();
  const [
    { data: providers },
    { data: assignments },
    { data: logins },
    { data: companies },
  ] = await Promise.all([
    supabase.from('hs_providers')
      .select('id, name, provider_type, contact_name, contact_email, contact_phone, website, active')
      .order('name'),
    supabase.from('hs_provider_companies')
      .select('id, provider_id, company_id, scopes, access_level, status, starts_on, ends_on, client_authorised_by, companies(name)')
      .order('created_at'),
    supabase.from('profiles')
      .select('id, email, full_name, hs_provider_id')
      .eq('role', 'hs_provider')
      .not('hs_provider_id', 'is', null)
      .order('email'),
    supabase.from('companies').select('id, name').eq('active', true).order('name'),
  ]);

  return (
    <>
      <AdminTopbar
        title="H&S Providers"
        subtitle="Outside consultancies and training companies, the clients they can see, and who at each has a login"
      />
      <main className="p-6 space-y-6">
        <ProvidersClient
          providers={(providers ?? []) as HsProvider[]}
          assignments={(assignments ?? []) as unknown as HsAssignment[]}
          logins={(logins ?? []) as HsProviderLogin[]}
          companies={(companies ?? []) as { id: string; name: string }[]}
        />
      </main>
    </>
  );
}
