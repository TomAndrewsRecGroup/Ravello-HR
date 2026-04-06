import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import EmployeeDocsClient from './EmployeeDocsClient';

export const metadata: Metadata = { title: 'Employee Documents' };

export default async function EmployeeDocsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

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
