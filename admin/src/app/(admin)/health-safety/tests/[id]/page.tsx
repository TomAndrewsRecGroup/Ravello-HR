import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import AdminTopbar from '@/components/layout/AdminTopbar';
import TestDetailClient from '@/components/hs/TestDetailClient';
import type { HsTest, HsTestAssignment, HsTestSession, HsTestSubmission } from '@/lib/hs/testTypes';

export const metadata: Metadata = { title: 'Test' };
export const dynamic = 'force-dynamic';

export default async function TestDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const { data: test } = await supabase.from('hs_tests')
    .select('id, title, description, category, source_type, external_url, pass_mark, questions, certifies_training, recert_months, active, created_at, updated_at')
    .eq('id', params.id).maybeSingle();
  if (!test) notFound();

  const [companies, employees, sessions, assignments, submissions] = await Promise.all([
    supabase.from('companies').select('id, name').eq('active', true).order('name'),
    readAllPages<{ id: string; company_id: string; full_name: string }>((from, to) =>
      supabase.from('employee_records').select('id, company_id, full_name').order('full_name').range(from, to)),
    supabase.from('hs_test_sessions').select('id, test_id, title, scheduled_on, notes, created_at').eq('test_id', params.id).order('created_at', { ascending: false }),
    supabase.from('hs_test_assignments').select('id, session_id, test_id, company_id, employee_id, status, created_at').eq('test_id', params.id).order('created_at', { ascending: false }),
    supabase.from('hs_test_submissions').select('id, assignment_id, company_id, employee_id, test_id, source, score, passed, notes, recorded_by_kind, submitted_at').eq('test_id', params.id),
  ]);

  return (
    <>
      <AdminTopbar title={test.title} subtitle="Sessions, assignments and results for this test" />
      <main className="admin-page flex-1">
        <TestDetailClient
          test={test as HsTest}
          companies={companies.data ?? []}
          employees={employees.rows}
          sessions={(sessions.data ?? []) as HsTestSession[]}
          assignments={(assignments.data ?? []) as HsTestAssignment[]}
          submissions={(submissions.data ?? []) as HsTestSubmission[]}
        />
      </main>
    </>
  );
}
