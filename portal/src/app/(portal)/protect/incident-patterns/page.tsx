import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { analyzeIncidentPatterns, type IncidentRow, type IncidentCauseRow, type IncidentInvestigationRow } from '@/lib/incidentPatterns/analyze';
import IncidentPatternsView from '@/components/hs/IncidentPatternsView';

export const metadata: Metadata = { title: 'Incident Patterns' };
export const dynamic = 'force-dynamic';

const WINDOWS = [30, 90, 365] as const;
type Window = typeof WINDOWS[number];

function isWindow(n: number): n is Window {
  return (WINDOWS as readonly number[]).includes(n);
}
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return toISODate(d);
}

// Core-OS 360 Phase 10, Group 2. Read-only — nothing here is
// self-certified, the standing PROTECT posture. Same pure computation
// and presentational component as the admin page, mirrored
// byte-identical (shared-dupe pairs). All reads are under the client's
// own session RLS (incident.read) — no service role needed, unlike the
// Legal Register page, because hs_incidents/incident_investigations/
// incident_causes/hs_sites/departments are all already client-readable
// under their own existing policies.
export default async function ProtectIncidentPatternsPage(props: { searchParams: Promise<{ days?: string }> }) {
  const searchParams = await props.searchParams;
  const requested = Number.parseInt(searchParams.days ?? '90', 10);
  const windowDays: Window = isWindow(requested) ? requested : 90;

  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const today = toISODate(new Date());
  const windowStart = daysAgo(windowDays);
  const priorStart = daysAgo(windowDays * 2);

  const [incidents, priorIncidents, investigations, causes, sitesRes, deptsRes] = await Promise.all([
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', windowStart).lte('occurred_on', today).range(from, to)),
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', priorStart).lt('occurred_on', windowStart).range(from, to)),
    readAllPages<IncidentInvestigationRow>((from, to) =>
      supabase.from('incident_investigations').select('id, incident_id').eq('company_id', companyId).range(from, to)),
    readAllPages<IncidentCauseRow>((from, to) =>
      supabase.from('incident_causes').select('investigation_id, cause_level, category, confirmed_at').eq('company_id', companyId).range(from, to)),
    supabase.from('hs_sites').select('id, name').eq('company_id', companyId),
    supabase.from('departments').select('id, name').eq('company_id', companyId),
  ]);

  const loadError = incidents.error ?? priorIncidents.error ?? investigations.error ?? causes.error
    ?? sitesRes.error?.message ?? deptsRes.error?.message ?? null;

  const summary = analyzeIncidentPatterns({
    incidents: incidents.rows,
    priorWindowIncidents: priorIncidents.rows,
    investigations: investigations.rows,
    causes: causes.rows,
  });

  const siteNames = Object.fromEntries((sitesRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const deptNames = Object.fromEntries((deptsRes.data ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));

  return (
    <main className="portal-page flex-1">
      <IncidentPatternsView
        windowDays={windowDays}
        windows={WINDOWS}
        summary={summary}
        siteNames={siteNames}
        deptNames={deptNames}
        loadError={loadError}
        basePath="/protect/incident-patterns"
      />
    </main>
  );
}
