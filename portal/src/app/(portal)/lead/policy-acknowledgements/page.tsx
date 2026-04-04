import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import PolicyAckClient from './PolicyAckClient';

export const metadata: Metadata = { title: 'Policy Acknowledgements' };

export default async function PolicyAcksPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id, role').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  const role = (profile as any)?.role;
  if (!companyId) return null;

  const isAdmin = role === 'client_admin' || role === 'tps_admin' || role === 'tps_recruiter';

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
