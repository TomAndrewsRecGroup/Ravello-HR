import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import InternalHiringClient from './InternalHiringClient';

export const metadata: Metadata = { title: 'Internal Roles' };

export default async function InternalHiringPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id, role').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  const role = (profile as any)?.role;
  if (!companyId) return null;

  const isAdmin = role === 'client_admin' || role === 'tps_admin' || role === 'tps_client';

  // Internal roles
  const { data: internalRoles } = await supabase
    .from('requisitions')
    .select('*')
    .eq('company_id', companyId)
    .eq('managed_by', 'internal')
    .order('created_at', { ascending: false });

  // TPO-managed stats for comparison
  const [tpoActiveRes, tpoFilledRes] = await Promise.all([
    supabase.from('requisitions')
      .select('id, created_at', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('managed_by', 'tpo')
      .neq('stage', 'filled').neq('stage', 'cancelled'),
    supabase.from('requisitions')
      .select('id, created_at, updated_at')
      .eq('company_id', companyId)
      .eq('managed_by', 'tpo')
      .eq('stage', 'filled'),
  ]);

  // Calculate TPO avg days to fill
  const tpoFilled = tpoFilledRes.data ?? [];
  let tpoAvgDays = 0;
  if (tpoFilled.length > 0) {
    const totalDays = tpoFilled.reduce((s: number, r: any) => {
      const created = new Date(r.created_at).getTime();
      const filled = new Date(r.updated_at).getTime();
      return s + Math.floor((filled - created) / 86400000);
    }, 0);
    tpoAvgDays = Math.round(totalDays / tpoFilled.length);
  }

  return (
    <main className="portal-page flex-1">
      <InternalHiringClient
        companyId={companyId}
        userId={user.id}
        isAdmin={isAdmin}
        internalRoles={internalRoles ?? []}
        tpoFilledCount={tpoFilled.length}
        tpoAvgDays={tpoAvgDays}
      />
    </main>
  );
}
