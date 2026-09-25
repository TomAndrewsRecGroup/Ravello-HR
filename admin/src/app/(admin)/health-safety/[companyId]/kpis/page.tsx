import type { Metadata } from 'next';
import { AlertTriangle, CalendarClock, ClipboardCheck, ShieldAlert, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { computeHsKpis } from '@/lib/hs/kpis';

export const metadata: Metadata = { title: 'H&S KPIs' };
export const dynamic = 'force-dynamic';

// Computed at read time from existing rows (incidents, activities,
// audits, equipment) — the same posture as lib/health/scoring.ts: no
// stored aggregate to drift out of sync with what it summarises.
export default async function HealthSafetyKpisPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const [incidents, activities, { data: audits }, equipment] = await Promise.all([
    readAllPages<{ severity: string; riddor_reportable: boolean; occurred_on: string }>((from, to) =>
      supabase.from('hs_incidents').select('severity, riddor_reportable, occurred_on')
        .eq('company_id', params.companyId).range(from, to)),
    readAllPages<{ activity_type: string; occurred_on: string }>((from, to) =>
      supabase.from('hs_activities').select('activity_type, occurred_on')
        .eq('company_id', params.companyId).range(from, to)),
    supabase.from('hs_audits').select('score, conducted_on').eq('company_id', params.companyId).order('conducted_on', { ascending: false }).limit(2),
    readAllPages<{ status: string; next_inspection_due: string | null }>((from, to) =>
      supabase.from('hs_equipment').select('status, next_inspection_due')
        .eq('company_id', params.companyId).range(from, to)),
  ]);

  const kpis = computeHsKpis({
    incidents: incidents.rows, activities: activities.rows,
    audits: (audits ?? []) as { score: number | null; conducted_on: string }[],
    equipment: equipment.rows, today,
  });

  const cards: { label: string; value: string; icon: React.ElementType; colour: string; hint?: string }[] = [
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
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map(c => (
        <div key={c.label} className="card p-4 flex items-center gap-4">
          <c.icon size={28} style={{ color: c.colour, flexShrink: 0 }} />
          <div>
            <p className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{c.value}</p>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{c.label}</p>
            {c.hint && <p className="text-xs" style={{ color: c.colour }}>{c.hint}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
