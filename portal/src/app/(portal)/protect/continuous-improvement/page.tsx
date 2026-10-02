import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
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

// Go-live gap list, item 8 — portal half. Read-only, nothing here is
// self-certified, the standing PROTECT posture. Same pure computation
// and presentational component as the admin page, mirrored
// byte-identical (shared-dupe pairs). All reads are under the
// client's own session RLS: hs_incidents/incident_investigations/
// incident_causes already client-readable (per the incident-patterns
// page this mirrors), audit_findings_client_read (Phase 4 Group 7)
// and objectives' own client-read policy (Phase 5 Group 6, reusing
// risk.read) cover the other two — no service role needed anywhere
// on this page.
export default async function ProtectContinuousImprovementPage(props: { searchParams: Promise<{ days?: string }> }) {
  const searchParams = await props.searchParams;
  const windowDays = clampWindowDays(Number.parseInt(searchParams.days ?? '90', 10));

  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const today = toISODate(new Date());
  const windows = incidentPatternWindows(today, windowDays);
  const { windowStart, windowEndExclusive, priorStart, priorEndExclusive } = windows;

  const [incidents, priorIncidents, investigations, causes, auditFindings, objectives] = await Promise.all([
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', windowStart).lt('occurred_on', windowEndExclusive).order('id').range(from, to)),
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', priorStart).lt('occurred_on', priorEndExclusive).order('id').range(from, to)),
    readAllPages<IncidentInvestigationRow>((from, to) =>
      supabase.from('incident_investigations').select('id, incident_id').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<IncidentCauseRow>((from, to) =>
      supabase.from('incident_causes').select('id, investigation_id, cause_level, category, confirmed_at').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<AuditFindingRow>((from, to) =>
      supabase.from('audit_findings').select('id, severity, created_at, closed_at').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<ObjectiveRow>((from, to) =>
      supabase.from('objectives').select('id, status').eq('company_id', companyId).order('id').range(from, to)),
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
    <main className="portal-page flex-1">
      <ContinuousImprovementView
        windowDays={windowDays}
        windows={WINDOWS}
        summary={summary}
        loadError={loadError}
        basePath="/protect/continuous-improvement"
      />
    </main>
  );
}
