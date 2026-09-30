import type { Metadata } from 'next';
import { Lightbulb } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { LESSON_LEARNED_CATEGORY_LABELS, type LessonLearned, type LessonLearnedDistribution, type LessonLearnedRead } from '@/lib/lessonsLearned/types';
import MarkLessonRead from '@/components/lessonsLearned/MarkLessonRead';

export const metadata: Metadata = { title: 'Lessons Learned' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 16, Group 2. lessons_learned is staff-only RLS —
// exactly the legal_requirements posture — so a client never browses
// it directly. This reads the caller's own distribution rows first
// (RLS-protected, their own company only), then fetches ONLY those
// lessons' content with the service role, filtered again to
// status = 'published' as defence in depth. The lesson's own
// source_type/source_id (staff-only traceability back to the real
// incident it was drawn from) is never selected here at all.
export default async function ProtectLessonsLearnedPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: distributions, error: distError } = await supabase.from('lesson_learned_distributions')
    .select('id, lesson_id, company_id, distributed_by, distributed_at')
    .eq('company_id', companyId).order('distributed_at', { ascending: false }).limit(500);
  const distributionRows = (distributions ?? []) as LessonLearnedDistribution[];
  const lessonIds = distributionRows.map(d => d.lesson_id);

  let lessonsById = new Map<string, LessonLearned>();
  if (lessonIds.length > 0) {
    const svc = createServiceSupabaseClient();
    const { data: lessons } = await svc.from('lessons_learned')
      .select('id, title, category, summary, recommended_action, status, published_at')
      .in('id', lessonIds).eq('status', 'published');
    lessonsById = new Map(((lessons ?? []) as LessonLearned[]).map(l => [l.id, l]));
  }

  const { data: reads } = await supabase.from('lesson_learned_reads')
    .select('id, lesson_id, company_id, read_by, read_by_name, read_at')
    .eq('company_id', companyId).limit(500);
  const readLessonIds = new Set(((reads ?? []) as LessonLearnedRead[]).map(r => r.lesson_id));

  const items = distributionRows
    .map(d => lessonsById.get(d.lesson_id))
    .filter((l): l is LessonLearned => !!l);

  return (
    <main className="portal-page flex-1 space-y-4">
      {distError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Lessons learned could not be loaded. Refresh to try again.</p>}
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        A lesson shared here is a generalised, anonymised write-up drawn from a real incident or finding elsewhere
        on the platform — never a specific client, name or location. Read it for what it can teach your own
        operation.
      </div>
      {items.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Lightbulb size={28} style={{ color: 'var(--gold)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No lessons have been shared with you yet</p></div></div>
      ) : (
        <div className="space-y-4">
          {items.map(l => (
            <div key={l.id} className="card p-5 space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong>{l.title}</strong>
                <span className="badge">{LESSON_LEARNED_CATEGORY_LABELS[l.category] ?? l.category}</span>
                <span className="ml-auto text-xs" style={{ color: 'var(--ink-faint)' }}>{fmt(l.published_at)}</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{l.summary}</p>
              {l.recommended_action && (
                <p className="text-sm rounded-md p-3" style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)' }}>
                  <strong>Recommended action: </strong>{l.recommended_action}
                </p>
              )}
              <MarkLessonRead lessonId={l.id} alreadyRead={readLessonIds.has(l.id)} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
