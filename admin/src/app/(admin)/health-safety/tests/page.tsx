import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import TestsClient from '@/components/hs/TestsClient';
import type { HsTest } from '@/lib/hs/testTypes';

export const metadata: Metadata = { title: 'H&S tests' };
export const dynamic = 'force-dynamic';

// The test bank: reusable definitions. Sessions (a cohort taking one on
// a given day) live on each test's own detail page, the same split
// audit templates (staff reference data) already use against live
// audits (per-visit records).
export default async function HealthSafetyTestsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: tests } = await supabase.from('hs_tests')
    .select('id, title, description, category, source_type, external_url, pass_mark, questions, certifies_training, recert_months, active, created_at, updated_at')
    .order('active', { ascending: false }).order('title');

  return (
    <>
      <AdminTopbar title="Tests" subtitle="Build a quiz the platform marks itself, or track a test delivered by link, Microsoft Forms or in person" />
      <main className="admin-page flex-1">
        <TestsClient tests={(tests ?? []) as HsTest[]} />
      </main>
    </>
  );
}
