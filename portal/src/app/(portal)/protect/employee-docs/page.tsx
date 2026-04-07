import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import EmployeeDocsClient from './EmployeeDocsClient';

export const metadata: Metadata = { title: 'Employee Documents' };
export const revalidate = 30;

export default async function EmployeeDocsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
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

  const { data: docs } = await supabase
    .from('employee_documents')
    .select('*')
    .eq('company_id', companyId)
    .order('employee_name', { ascending: true });

  return (
      <main className="portal-page flex-1">
        <EmployeeDocsClient companyId={companyId} userId={user.id} initialDocs={docs ?? []} />
      </main>
  );
}
