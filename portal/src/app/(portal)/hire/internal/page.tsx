import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import InternalHiringClient from './InternalHiringClient';

export const metadata: Metadata = { title: 'Internal Roles' };

export default async function InternalHiringPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, isTpsStaff, role } = await getSessionProfile();
  if (!user) redirect('/auth/login');

  if (!companyId && !isTpsStaff) return (
    <main className="portal-page flex-1">
      <div className="card p-12 text-center">
        <div className="empty-state">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No company linked</p>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>This page will populate once your company profile is set up.</p>
        </div>
      </div>
    </main>
  );

  const isAdmin = role === 'client_admin' || isTpsStaff;

  let internalRoles: any[] = [];
  let tpoFilled: any[] = [];
  let tpoAvgDays = 0;

  if (companyId) {
    // Internal roles
    const { data: roles } = await supabase
      .from('requisitions')
      .select('*')
      .eq('company_id', companyId)
      .eq('managed_by', 'internal')
      .order('created_at', { ascending: false });
    internalRoles = roles ?? [];

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

    tpoFilled = tpoFilledRes.data ?? [];
    if (tpoFilled.length > 0) {
      const totalDays = tpoFilled.reduce((s: number, r: any) => {
        const created = new Date(r.created_at).getTime();
        const filled = new Date(r.updated_at).getTime();
        return s + Math.floor((filled - created) / 86400000);
      }, 0);
      tpoAvgDays = Math.round(totalDays / tpoFilled.length);
    }
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
