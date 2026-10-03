import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { MANAGEMENT_REVIEW_STATUS_LABELS } from '@/lib/hs/vocab';
import type { ManagementReview, ManagementReviewDecision } from '@/lib/hs/types';
import LinkedActionBadge, { type LinkedActionSummary } from '@/components/hs/LinkedActionBadge';

export const metadata: Metadata = { title: 'Management Review' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 5, Group 6 (migration 161). Read-only. Shows only
// COMPLETED reviews and the decisions reached — the internal data pack
// (open actions, overdue register counts, audit scores, …) is staff
// analysis material and is deliberately NOT shown here
// (management_review_data_pack is staff-only RLS); what a client needs
// is the outcome the review reached, not the working behind it.
export default async function ProtectManagementReviewPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: reviews, error: reviewError } = await supabase.from('management_reviews')
    .select('id, company_id, review_date, chaired_by, status, completed_at, created_by, created_at, updated_at')
    .eq('company_id', companyId).eq('status', 'completed').order('review_date', { ascending: false }).limit(500);
  const reviewRows = (reviews ?? []) as ManagementReview[];

  const reviewIds = reviewRows.map(r => r.id);
  const { data: decisions, error: decError } = reviewIds.length > 0
    ? await supabase.from('management_review_decisions')
        .select('id, review_id, company_id, topic, decision_text, resulting_action_id, created_by, created_at')
        .in('review_id', reviewIds).order('created_at').limit(500)
    : { data: [] as ManagementReviewDecision[], error: null };
  const decisionRows = (decisions ?? []) as ManagementReviewDecision[];

  // UI/UX cross-linking pass (2026-10-03): mirrors admin's own
  // management-review page fix — a decision's resulting_action_id used
  // to render as a bare "Action raised" badge with no status.
  const resultingActionIds = [...new Set(decisionRows.map(d => d.resulting_action_id).filter((id): id is string => id != null))];
  const { data: linkedActions } = resultingActionIds.length > 0
    ? await supabase.from('actions')
        .select('id, title, status, priority, due_date, verification_required, verified_at')
        .eq('company_id', companyId).in('id', resultingActionIds).limit(200)
    : { data: [] as LinkedActionSummary[] };

  return (
    <main className="portal-page flex-1 space-y-4">
      {(reviewError || decError) && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>The management review record could not be loaded. Refresh to try again.</p>}
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        This shows completed management reviews for your organisation and the decisions reached.
      </div>
      {reviewRows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><ClipboardList size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No completed management reviews recorded yet</p></div></div>
      ) : (
        <div className="space-y-4">
          {reviewRows.map(r => {
            const reviewDecisions = decisionRows.filter(d => d.review_id === r.id);
            return (
              <div key={r.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong>Review — {fmt(r.review_date)}</strong>
                  <span className="ml-auto badge">{MANAGEMENT_REVIEW_STATUS_LABELS[r.status]}</span>
                </div>
                {reviewDecisions.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No decisions recorded for this review.</p>
                ) : (
                  <ul className="space-y-2">
                    {reviewDecisions.map(d => (
                      <li key={d.id} className="rounded-md p-3 text-sm space-y-2" style={{ background: 'var(--surface-soft)' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{d.topic}</span>
                        </div>
                        <p style={{ color: 'var(--ink-soft)' }}>{d.decision_text}</p>
                        {d.resulting_action_id && (
                          <LinkedActionBadge action={(linkedActions ?? []).find(a => a.id === d.resulting_action_id) ?? null} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
