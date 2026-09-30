import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { ManagementReview, ManagementReviewAttendee, ManagementReviewDataPack, ManagementReviewDecision } from '@/lib/hs/types';
import ManagementReviewClient from '@/components/hs/ManagementReviewClient';

export const metadata: Metadata = { title: 'Management review' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 6 (migration 161). ISO clause 9.3. The
// data pack shown here is whatever was last STORED for the selected
// review — never recomputed on this read — so it stays reproducible
// even after the underlying counts have moved on.
export default async function HealthSafetyManagementReviewPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: reviews, error: reviewError }, people, { data: company }] = await Promise.all([
    supabase.from('management_reviews')
      .select('id, company_id, review_date, chaired_by, status, completed_at, created_by, created_at, updated_at')
      .eq('company_id', params.companyId).order('review_date', { ascending: false }),
    readAllPages<{ id: string; full_name: string }>((from, to) =>
      supabase.from('people').select('id, full_name').eq('company_id', params.companyId).order('full_name').order('id').range(from, to)),
    supabase.from('companies').select('name').eq('id', params.companyId).maybeSingle(),
  ]);

  const reviewRows = (reviews ?? []) as ManagementReview[];
  const reviewIds = reviewRows.map(r => r.id);

  const [{ data: attendees, error: attError }, { data: packs, error: packError }, { data: decisions, error: decError }] = reviewIds.length > 0
    ? await Promise.all([
        supabase.from('management_review_attendees').select('id, review_id, company_id, person_id, attended, created_at').in('review_id', reviewIds),
        supabase.from('management_review_data_pack').select('id, review_id, company_id, computed_at, computed_by, data, created_at').in('review_id', reviewIds).order('computed_at', { ascending: false }),
        supabase.from('management_review_decisions').select('id, review_id, company_id, topic, decision_text, resulting_action_id, created_by, created_at').in('review_id', reviewIds).order('created_at'),
      ])
    : [{ data: [] as ManagementReviewAttendee[], error: null }, { data: [] as ManagementReviewDataPack[], error: null }, { data: [] as ManagementReviewDecision[], error: null }];

  return (
    <ManagementReviewClient
      companyId={params.companyId}
      companyName={(company as { name?: string } | null)?.name ?? 'This client'}
      reviews={reviewRows}
      attendees={(attendees ?? []) as ManagementReviewAttendee[]}
      dataPacks={(packs ?? []) as ManagementReviewDataPack[]}
      decisions={(decisions ?? []) as ManagementReviewDecision[]}
      people={people.rows}
      loadError={reviewError?.message ?? attError?.message ?? packError?.message ?? decError?.message ?? null}
    />
  );
}
