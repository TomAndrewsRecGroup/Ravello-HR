import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import CandidatesClient from './CandidatesClient';
import { Users2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Candidates' };
export const revalidate = 30;

export default async function CandidatesPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: candidates }, { data: companies }] = await Promise.all([
    supabase
      .from('candidates')
      .select('*, requisitions(title, companies(name))')
      .order('created_at', { ascending: false }),
    supabase
      .from('companies')
      .select('id, name')
      .eq('active', true)
      .order('name'),
  ]);

  const allCandidates = candidates ?? [];
  const companyList   = companies ?? [];

  const statsByStage = ['applied','screening','interviewing','offer','hired','rejected'].map(stage => ({
    stage,
    count: allCandidates.filter((c: any) => (c.pipeline_stage ?? 'applied') === stage).length,
  }));

  const STAGE_COLORS: Record<string, string> = {
    applied: 'var(--ink-faint)', screening: 'var(--blue)', interviewing: 'var(--purple)',
    offer: 'var(--teal)', hired: 'var(--success)', rejected: 'var(--red)',
  };

  return (
    <>
      <AdminTopbar
        title="Candidates"
        subtitle={`${allCandidates.length} total candidates across all roles`}
      />
      <main className="admin-page flex-1">

        {/* Stage summary */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {statsByStage.map(({ stage, count }) => (
            <div key={stage} className="card p-4 text-center">
              <p className="text-2xl font-bold font-display" style={{ color: STAGE_COLORS[stage] }}>{count}</p>
              <p className="text-[11px] font-medium mt-1 capitalize" style={{ color: 'var(--ink-faint)' }}>{stage}</p>
            </div>
          ))}
        </div>

        <CandidatesClient
          initialCandidates={allCandidates as any[]}
          companies={companyList as any[]}
        />
      </main>
    </>
  );
}
