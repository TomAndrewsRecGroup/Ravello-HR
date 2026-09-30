import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { analyzeIncidentPatterns, incidentPatternWindows, clampWindowDays, type IncidentRow, type IncidentCauseRow, type IncidentInvestigationRow } from '@/lib/incidentPatterns/analyze';
import IncidentPatternsView from '@/components/hs/IncidentPatternsView';

export const metadata: Metadata = { title: 'Incident Patterns' };
export const dynamic = 'force-dynamic';

// Quick-pick presets only — NOT the validity check any more. Any value
// within [MIN_WINDOW_DAYS, MAX_WINDOW_DAYS] is accepted via
// clampWindowDays() (Core-OS 360 Completion Programme, Phase 25,
// Group 3, C10.4): the custom window input on the page below.
const WINDOWS = [30, 90, 365] as const;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Core-OS 360 Phase 10, Group 2. Historical, factual pattern surfacing
// only — never a prediction or a risk score (see lib/incidentPatterns/
// analyze.ts's own header). A window picker drives a plain searchParams
// re-render, the exact pattern the Safety Timeline page already uses —
// no client-side fetch needed for a filter this simple.
export default async function IncidentPatternsPage(
  props: { params: Promise<{ companyId: string }>; searchParams: Promise<{ days?: string }> }
) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const windowDays = clampWindowDays(Number.parseInt(searchParams.days ?? '90', 10));

  const supabase = await createServerSupabaseClient();
  const today = toISODate(new Date());
  const { windowStart, windowEndExclusive, priorStart, priorEndExclusive } = incidentPatternWindows(today, windowDays);

  const [incidents, priorIncidents, investigations, causes, sitesRes, deptsRes] = await Promise.all([
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
    supabase.from('hs_sites').select('id, name').eq('company_id', params.companyId),
    supabase.from('departments').select('id, name').eq('company_id', params.companyId),
  ]);

  const loadError = incidents.error ?? priorIncidents.error ?? investigations.error ?? causes.error
    ?? sitesRes.error?.message ?? deptsRes.error?.message ?? null;

  const summary = analyzeIncidentPatterns({
    incidents: incidents.rows,
    priorWindowIncidents: priorIncidents.rows,
    investigations: investigations.rows,
    causes: causes.rows,
  });

  const siteNames = new Map((sitesRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const deptNames = new Map((deptsRes.data ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));

  return (
    <IncidentPatternsView
      windowDays={windowDays}
      windows={WINDOWS}
      summary={summary}
      siteNames={Object.fromEntries(siteNames)}
      deptNames={Object.fromEntries(deptNames)}
      loadError={loadError}
      basePath={`/health-safety/${params.companyId}/incident-patterns`}
    />
  );
}
