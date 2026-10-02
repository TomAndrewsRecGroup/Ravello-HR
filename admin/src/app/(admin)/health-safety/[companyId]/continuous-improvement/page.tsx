import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { incidentPatternWindows, clampWindowDays, type IncidentRow, type IncidentCauseRow, type IncidentInvestigationRow } from '@/lib/incidentPatterns/analyze';
import { computeContinuousImprovement, type AuditFindingRow, type ObjectiveRow } from '@/lib/continuousImprovement/analyze';
import ContinuousImprovementView from '@/components/hs/ContinuousImprovementView';

export const metadata: Metadata = { title: 'Continuous Improvement' };
export const dynamic = 'force-dynamic';

const WINDOWS = [30, 90, 365] as const;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Go-live gap list, item 8. "Are we getting better?" composed from
// three already-built facts (audit findings, incident root causes,
// objective progress) — see lib/continuousImprovement/analyze.ts's own
// header for why this reuses analyzeIncidentPatterns() verbatim rather
// than re-deriving the recurring-root-cause grouping a second time.
// The window picker is the exact incident-patterns page pattern: a
// plain searchParams re-render, no client-side fetch.
export default async function ContinuousImprovementPage(
  props: { params: Promise<{ companyId: string }>; searchParams: Promise<{ days?: string }> }
) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const windowDays = clampWindowDays(Number.parseInt(searchParams.days ?? '90', 10));

  const supabase = await createServerSupabaseClient();
  const today = toISODate(new Date());
  const windows = incidentPatternWindows(today, windowDays);
  const { windowStart, windowEndExclusive, priorStart, priorEndExclusive } = windows;

  const [incidents, priorIncidents, investigations, causes, auditFindings, objectives] = await Promise.all([
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', params.companyId).gte('occurred_on', windowStart).lt('occurred_on', windowEndExclusive).order('id').range(from, to)),
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', params.companyId).gte('occurred_on', priorStart).lt('occurred_on', priorEndExclusive).order('id').range(from, to)),
    readAllPages<IncidentInvestigationRow>((from, to) =>
      supabase.from('incident_investigations').select('id, incident_id').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<IncidentCauseRow>((from, to) =>
      supabase.from('incident_causes').select('id, investigation_id, cause_level, category, confirmed_at').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<AuditFindingRow>((from, to) =>
      supabase.from('audit_findings').select('id, severity, created_at, closed_at').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<ObjectiveRow>((from, to) =>
      supabase.from('objectives').select('id, status').eq('company_id', params.companyId).order('id').range(from, to)),
  ]);

  const loadError = incidents.error ?? priorIncidents.error ?? investigations.error ?? causes.error
    ?? auditFindings.error ?? objectives.error ?? null;

  const summary = computeContinuousImprovement({
    ...windows,
    auditFindings: auditFindings.rows,
    objectives: objectives.rows,
    incidentPatternInput: {
      incidents: incidents.rows,
      priorWindowIncidents: priorIncidents.rows,
      investigations: investigations.rows,
      causes: causes.rows,
    },
  });

  return (
    <ContinuousImprovementView
      windowDays={windowDays}
      windows={WINDOWS}
      summary={summary}
      loadError={loadError}
      basePath={`/health-safety/${params.companyId}/continuous-improvement`}
    />
  );
}
