import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages, type PagedResult } from '@/lib/supabase/paged';
import type { LessonLearned, LessonLearnedDistribution, LessonLearnedRead } from '@/lib/lessonsLearned/types';
import type { DistributionCandidate } from '@/lib/lessonsLearned/suggestDistribution';
import LessonsLearnedClient from '@/components/lessonsLearned/LessonsLearnedClient';

export const metadata: Metadata = { title: 'Lessons Learned' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 16, Group 2. lessons_learned has no company_id —
// it is staff-only reference content, the exact legal_requirements
// shape — so this page lists every lesson across the whole platform,
// the same cross-client posture legal-register/iso-readiness/
// governance-calendar already have.
export default async function LessonsLearnedPage() {
  const supabase = await createServerSupabaseClient();

  const lessons = await readAllPages<LessonLearned>((from, to) =>
    supabase.from('lessons_learned')
      .select('id, title, category, summary, recommended_action, source_type, source_id, status, created_by, published_by, published_at, created_at, updated_at')
      .order('created_at', { ascending: false }).order('id').range(from, to));

  const lessonIds = lessons.rows.map(l => l.id);

  const empty = <T,>(): PagedResult<T> => ({ rows: [], data: [], error: null, truncated: false, pages: 0 });

  const [distributionsRes, readsRes, companiesRes] = await Promise.all([
    lessonIds.length > 0
      ? readAllPages<LessonLearnedDistribution>((from, to) =>
          supabase.from('lesson_learned_distributions').select('id, lesson_id, company_id, distributed_by, distributed_at')
            .in('lesson_id', lessonIds).order('id').range(from, to))
      : Promise.resolve(empty<LessonLearnedDistribution>()),
    lessonIds.length > 0
      ? readAllPages<LessonLearnedRead>((from, to) =>
          supabase.from('lesson_learned_reads').select('id, lesson_id, company_id, read_by, read_by_name, read_at')
            .in('lesson_id', lessonIds).order('id').range(from, to))
      : Promise.resolve(empty<LessonLearnedRead>()),
    readAllPages<{ id: string; name: string; sector: string | null; active: boolean }>((from, to) =>
      supabase.from('companies').select('id, name, sector, active').order('name').order('id').range(from, to)),
  ]);

  const candidates: DistributionCandidate[] = companiesRes.rows.map(c => ({ id: c.id, name: c.name, sector: c.sector, active: c.active }));

  return (
    <>
      <AdminTopbar title="Lessons Learned" subtitle="A generalised, anonymised lesson from one client's real incident or finding, shared with others who might benefit" />
      <main className="admin-page flex-1 space-y-4">
        {companiesRes.error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load the client list — distribution may be unavailable.</p>}
        <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          A lesson is written by staff, deliberately anonymised — the real source incident or finding is never
          shown to any other client, only used here for staff traceability. Publishing a lesson shares only the
          title, summary and recommended action you write below, with the companies you choose.
        </div>
        <LessonsLearnedClient
          lessons={lessons.rows}
          loadError={lessons.error}
          distributions={distributionsRes.rows}
          reads={readsRes.rows}
          companies={candidates}
        />
      </main>
    </>
  );
}
