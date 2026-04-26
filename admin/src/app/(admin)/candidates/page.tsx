import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import CandidatesClient from './CandidatesClient';
import { Users2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Candidates' };
export const revalidate = 30;

// Cap on initial fetch. 500 keeps client-side search/filter snappy for the
// admin's typical use, while cutting initial DOM + transfer ~75% vs. the
// previous 2000 limit. If the candidate volume grows past this cap the
// stage-counter cards (which use a separate count query below) will still
// reflect the true total — only the table will be capped, with a hint.
const PAGE_CAP = 500;

export default async function CandidatesPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: candidates }, { count: totalCandidates }, { data: companies }] = await Promise.all([
    supabase
      .from('candidates')
      .select('id,full_name,email,cv_url,cv_file_path,client_status,pipeline_stage,screening_score,source,requisition_id,requisitions(title, companies(name))')
      .order('created_at', { ascending: false })
      .limit(PAGE_CAP),
    supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('companies')
      .select('id, name')
      .eq('active', true)
      .order('name'),
  ]);

  const allCandidates = candidates ?? [];
  const companyList   = companies ?? [];
  const grandTotal    = totalCandidates ?? allCandidates.length;
  const isCapped      = grandTotal > PAGE_CAP;

  // Stage stats are derived from the *current page* of results. With
  // PAGE_CAP=500 these match reality unless the dataset is very large;
  // the topbar subtitle below makes the cap explicit so the user isn't
  // surprised by stale-looking numbers.
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
        subtitle={
          isCapped
            ? `Showing ${allCandidates.length} most recent of ${grandTotal} total · refine with filters to see older entries`
            : `${grandTotal} total candidates across all roles`
        }
      />
      <main className="admin-page flex-1">

        {/* Stage summary */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {statsByStage.map(({ stage, count }) => (
            <div key={stage} className="stat-card text-center">
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
