import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BenchmarkClient from './BenchmarkClient';

export const metadata: Metadata = { title: 'Salary Benchmarks' };
export const revalidate = 60;

export default async function SalaryBenchmarksPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: { user } }, { data: benchmarks }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('salary_benchmarks').select('*').order('role_type', { ascending: true }),
  ]);

  return (
    <>
      <AdminTopbar
        title="Benchmarks & Market Data"
        subtitle="Live IvyLens market signals alongside The People System's curated salary benchmarks"
      />
      <main className="admin-page flex-1">
        <BenchmarkClient userId={user?.id ?? ''} initialBenchmarks={benchmarks ?? []} />
      </main>
    </>
  );
}
