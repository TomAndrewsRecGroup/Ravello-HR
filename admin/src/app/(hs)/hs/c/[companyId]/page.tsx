import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { myGrant } from '@/lib/hs/access';

// Land on the first section this user may use: a training-only provider
// has no register to show.
export default async function HsCompanyIndex({ params }: { params: { companyId: string } }) {
  const supabase = createServerSupabaseClient();
  const company = await myGrant(supabase, params.companyId);
  if (!company) notFound();
  redirect(`/hs/c/${params.companyId}/${company.scopes.includes('register') ? 'register' : 'timeline'}`);
}
