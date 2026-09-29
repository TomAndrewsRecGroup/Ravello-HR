import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EnvironmentalAspect, EnvironmentalAspectAssessment } from '@/lib/hs/types';
import EnvironmentalAspectsClient from '@/components/hs/EnvironmentalAspectsClient';

export const metadata: Metadata = { title: 'Environmental aspects' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 1 (156): the environmental aspects & impacts
// register. Read the ONLY significance rule: never AI-scored, always a
// deterministic likelihood x severity x frequency score with an explicit
// human confirmation — computed and gated by the database, this page
// only displays it.
export default async function HealthSafetyEnvironmentalAspectsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const aspects = await readAllPages<EnvironmentalAspect>((from, to) =>
    supabase.from('environmental_aspects')
      .select('id, company_id, site_id, activity, aspect_type, condition, description, version, status, supersedes_id, created_by, created_at, updated_at')
      .eq('company_id', params.companyId)
      .order('activity').order('id')
      .range(from, to));

  const aspectIds = aspects.rows.map(a => a.id);
  const { data: assessments, error: assessError } = aspectIds.length > 0
    ? await supabase.from('environmental_aspect_assessments')
        .select('id, aspect_id, company_id, likelihood, severity, frequency, computed_score, significance_threshold_used, is_significant, confirmed_by, confirmed_at, methodology_notes, created_by, created_at')
        .in('aspect_id', aspectIds)
        .order('created_at', { ascending: false })
    : { data: [] as EnvironmentalAspectAssessment[], error: null };

  return (
    <EnvironmentalAspectsClient
      companyId={params.companyId}
      aspects={aspects.rows}
      assessments={(assessments ?? []) as EnvironmentalAspectAssessment[]}
      loadError={aspects.error ?? assessError?.message ?? (aspects.truncated ? 'Showing the first part of a long aspects list.' : null)}
    />
  );
}
