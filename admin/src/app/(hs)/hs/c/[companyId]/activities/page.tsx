import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { canWrite, myGrant } from '@/lib/hs/access';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsActivity, HsFile } from '@/lib/hs/types';
import ActivitiesClient, { type FollowupSuggestion } from '@/components/hs/ActivitiesClient';

export const metadata: Metadata = { title: 'H&S activities' };
export const dynamic = 'force-dynamic';

// Logged events: site visits, advice calls, fire drills, SSIP
// submissions, inspections. Insert-only (095): a correction is a new entry.
export default async function HsActivitiesPage({ params }: { params: { companyId: string } }) {
  const supabase = createServerSupabaseClient();
  const grant = await myGrant(supabase, params.companyId);
  if (!grant || !grant.scopes.includes('register')) notFound();

  const [{ data: activities, error }, files, { data: role }] = await Promise.all([
    supabase.from('hs_activities')
      .select('id, company_id, activity_type, title, occurred_on, summary, recorded_by_kind, created_at')
      .eq('company_id', params.companyId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    readAllPages<HsFile>((from, to) =>
      supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', params.companyId)
        .eq('entity_type', 'activity')
        .order('created_at', { ascending: false }).order('id')
        .range(from, to)),
    supabase.rpc('get_my_role'),
  ]);

  // Jev follow-up suggestions are staff-only (jev_decisions is staff-read);
  // a provider's page simply has none. Read under the session, never the
  // service role — this is app/(hs).
  const isStaff = role === 'tps_admin';
  const followups: Record<string, FollowupSuggestion> = {};
  if (isStaff && (activities ?? []).length > 0) {
    const { data: decisions } = await supabase.from('jev_decisions')
      .select('id, entity_id, selected, human_outcome, gated')
      .eq('kind', 'hs_activity_followup').eq('company_id', params.companyId)
      .in('entity_id', (activities ?? []).map((a: { id: string }) => a.id))
      .order('created_at', { ascending: false });
    for (const d of (decisions ?? []) as { id: string; entity_id: string; selected: Record<string, unknown> | null; human_outcome: string | null; gated: boolean }[]) {
      if (followups[d.entity_id] || d.gated || !d.selected) continue;
      const p = Number(d.selected.needs_followup ?? 0);
      const severity = String(d.selected.severity ?? 'none');
      if (p >= 0.8 && severity !== 'none') followups[d.entity_id] = { decision_id: d.id, probability: p, severity, outcome: d.human_outcome };
    }
  }

  return (
    <ActivitiesClient
      companyId={params.companyId}
      canRecord={canWrite(grant, 'register')}
      activities={(activities ?? []) as HsActivity[]}
      files={files.rows}
      loadError={error?.message ?? files.error ?? null}
      followups={followups}
      canRaise={isStaff}
    />
  );
}
