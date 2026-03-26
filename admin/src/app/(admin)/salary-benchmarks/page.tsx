import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BenchmarkClient from './BenchmarkClient';

export const metadata: Metadata = { title: 'Salary Benchmarks' };

export default async function SalaryBenchmarksPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: benchmarks } = await supabase
    .from('salary_benchmarks')
    .select('*')
    .order('role_type', { ascending: true });

  return (
    <>
      <AdminTopbar
        title="Salary Benchmarks"
        subtitle="Market salary data for client role comparisons"
      />
      <main className="admin-page flex-1">
        <BenchmarkClient userId={user.id} initialBenchmarks={benchmarks ?? []} />
      </main>
    </>
  );
}
