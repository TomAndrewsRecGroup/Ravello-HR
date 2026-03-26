import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import EmployeeDocsClient from './EmployeeDocsClient';

export const metadata: Metadata = { title: 'Employee Documents' };

export default async function EmployeeDocsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) return null;

  const { data: docs } = await supabase
    .from('employee_documents')
    .select('*')
    .eq('company_id', companyId)
    .order('employee_name', { ascending: true });

  return (
    <>
      <Topbar title="Employee Documents" subtitle="Contracts, right to work, DBS checks and more" />
      <main className="portal-page flex-1">
        <EmployeeDocsClient companyId={companyId} userId={user.id} initialDocs={docs ?? []} />
      </main>
    </>
  );
}
