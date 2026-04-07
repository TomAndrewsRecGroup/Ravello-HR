import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import PolicyAckClient from './PolicyAckClient';

export const metadata: Metadata = { title: 'Policy Acknowledgements' };
export const revalidate = 60;

export default async function PolicyAcksPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, role } = await getSessionProfile();
  if (!user) redirect('/auth/login');
  if (!companyId) return (
    <main className="portal-page flex-1">
      <div className="card p-12 text-center">
        <div className="empty-state">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No company linked</p>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>This page will populate once your company profile is set up.</p>
        </div>
      </div>
    </main>
  );

  const isAdmin = role === 'client_admin' || role === 'tps_admin' || role === 'tps_client';

  const [docsRes, acksRes, employeesRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id, name, category, version')
      .eq('company_id', companyId)
      .in('category', ['policy', 'handbook', 'contract'])
      .order('name'),
    supabase
      .from('policy_acknowledgements')
      .select('*, documents(name, category, version), employee_records(full_name, job_title)')
      .eq('company_id', companyId)
      .order('sent_at', { ascending: false }),
    supabase
      .from('employee_records')
      .select('id, full_name, job_title')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('full_name'),
  ]);

  return (
    <main className="portal-page flex-1">
      <PolicyAckClient
        companyId={companyId}
        isAdmin={isAdmin}
        documents={docsRes.data ?? []}
        acknowledgements={acksRes.data ?? []}
        employees={employeesRes.data ?? []}
      />
    </main>
  );
}
