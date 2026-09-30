import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import EmployeeDocsClient from './EmployeeDocsClient';

export const metadata: Metadata = { title: 'Employee Documents' };
export const revalidate = 30;

export default async function EmployeeDocsPage() {
  const supabase = await createServerSupabaseClient();
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

  const [{ data: docs }, { data: employees }] = await Promise.all([
    supabase
      .from('employee_documents')
      .select('id,employee_name,employee_id,employee_email,department,doc_type,title,file_storage_path,file_url,expiry_date,status,filed_by_authorised,notes,created_at')
      .eq('company_id', companyId)
      .order('employee_name', { ascending: true }),
    // For the upload form's "Link to employee record" picker (C3.7): a
    // document filed against a real employee_records row is what makes
    // it count toward that person's training/compliance status
    // elsewhere in the platform (person_id is derived from employee_id
    // by employee_document_person_guard, migration 142).
    supabase.from('employee_records').select('id, full_name').eq('company_id', companyId).eq('status', 'active').order('full_name').limit(500),
  ]);

  return (
      <main className="portal-page flex-1">
        <EmployeeDocsClient companyId={companyId} userId={user.id} initialDocs={docs ?? []} employeeRecords={employees ?? []} />
      </main>
  );
}
