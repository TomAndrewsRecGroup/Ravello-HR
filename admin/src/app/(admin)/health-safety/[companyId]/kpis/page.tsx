import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, ClipboardCheck, ShieldAlert, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { computeHsKpis } from '@/lib/hs/kpis';
import { computePortfolioCounts, type ActionRow } from '@/lib/health/portfolioCounts';

export const metadata: Metadata = { title: 'H&S KPIs' };
export const dynamic = 'force-dynamic';

// Computed at read time from existing rows (incidents, activities,
// audits, equipment) — the same posture as lib/health/scoring.ts: no
// stored aggregate to drift out of sync with what it summarises.
export default async function HealthSafetyKpisPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const [incidents, activities, { data: audits }, equipment, actions] = await Promise.all([
    readAllPages<{ severity: string; riddor_reportable: boolean; occurred_on: string }>((from, to) =>
      supabase.from('hs_incidents').select('id, severity, riddor_reportable, occurred_on')
        .eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<{ activity_type: string; occurred_on: string }>((from, to) =>
      supabase.from('hs_activities').select('id, activity_type, occurred_on')
        .eq('company_id', params.companyId).order('id').range(from, to)),
    supabase.from('hs_audits').select('score, conducted_on').eq('company_id', params.companyId).order('conducted_on', { ascending: false }).limit(2),
    readAllPages<{ status: string; next_inspection_due: string | null }>((from, to) =>
      supabase.from('hs_equipment').select('id, status, next_inspection_due')
        .eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<ActionRow>((from, to) =>
      supabase.from('actions').select('company_id, status, severity')
        .eq('company_id', params.companyId).order('id').range(from, to)),
  ]);

  const kpis = computeHsKpis({
    incidents: incidents.rows, activities: activities.rows,
    audits: (audits ?? []) as { score: number | null; conducted_on: string }[],
    equipment: equipment.rows, today,
  });

  // This page shows the client's H&S record but nothing about the
  // corrective-action backlog those records raise. Reuses
  // computePortfolioCounts()'s own canonical open_critical_actions
  // definition (the exact one Core 360 Status's "EHS Posture" section
  // already surfaces) rather than re-deriving the same threshold here
  // — every other input left empty, since this page needs only the one
  // count for this one company.
  const openCriticalActions = computePortfolioCounts([params.companyId], new Date(), {
    actions: actions.rows, legalObligations: [], documentsReviewDue: [], incidents: [],
    deploymentStatus: [], equipment: [], auditFindings: [], contractors: [], contractorInsurances: [],
    environmentalPermits: [], managementReviews: [], serviceRequests: [], consultancyVisits: [],
  }).get(params.companyId)!.open_critical_actions;

  const cards: { label: string; value: string; icon: React.ElementType; colour: string; hint?: string; href?: string }[] = [
    { label: 'Incidents (12mo)', value: String(kpis.incidentsLast12Months), icon: ShieldAlert, colour: 'var(--ink)' },
    { label: 'RIDDOR reports (12mo)', value: String(kpis.riddorLast12Months), icon: AlertTriangle, colour: kpis.riddorLast12Months > 0 ? 'var(--red)' : 'var(--teal)' },
    { label: 'Toolbox talks (12mo)', value: String(kpis.toolboxTalksLast12Months), icon: Users, colour: 'var(--blue)' },
    {
      label: 'Latest audit score', value: kpis.lastAuditScore == null ? '—' : `${Math.round(kpis.lastAuditScore)}%`,
      icon: kpis.auditScoreTrend === 'down' ? TrendingDown : kpis.auditScoreTrend === 'up' ? TrendingUp : ClipboardCheck,
      colour: kpis.auditScoreTrend === 'down' ? 'var(--red)' : kpis.auditScoreTrend === 'up' ? 'var(--teal)' : 'var(--ink-faint)',
      hint: kpis.auditScoreTrend ? `Trending ${kpis.auditScoreTrend}` : undefined,
    },
    { label: 'Equipment overdue', value: String(kpis.equipmentOverdueCount), icon: AlertTriangle, colour: kpis.equipmentOverdueCount > 0 ? 'var(--red)' : 'var(--teal)' },
    { label: 'Equipment due soon', value: String(kpis.equipmentDueSoonCount), icon: CalendarClock, colour: kpis.equipmentDueSoonCount > 0 ? 'var(--gold)' : 'var(--teal)' },
    // Go-live gap-list follow-up (2026-10-03): this page's own records
    // (incidents, audits, equipment) raise corrective actions, but
    // nothing here ever said how many are still outstanding — a real
    // backlog could sit invisible on a page built to show exactly this
    // client's H&S posture. Links out to the client's own Actions tab.
    {
      label: 'Open critical actions', value: String(openCriticalActions), icon: AlertTriangle,
      colour: openCriticalActions > 0 ? 'var(--red)' : 'var(--teal)',
      href: `/clients/${params.companyId}`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map(c => {
        const body = (
          <>
            <c.icon size={28} style={{ color: c.colour, flexShrink: 0 }} />
            <div>
              <p className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{c.value}</p>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{c.label}</p>
              {c.hint && <p className="text-xs" style={{ color: c.colour }}>{c.hint}</p>}
            </div>
          </>
        );
        return c.href ? (
          <Link key={c.label} href={c.href} className="card p-4 flex items-center gap-4">{body}</Link>
        ) : (
          <div key={c.label} className="card p-4 flex items-center gap-4">{body}</div>
        );
      })}
    </div>
  );
}
