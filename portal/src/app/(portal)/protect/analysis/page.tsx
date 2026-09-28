import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { getSafetyContext, orgSitesAndDepartments, param, fmtDate } from '@/lib/hs/safetyContext';
import {
  HAZARD_STATUS_LABELS, DOC_STATUS_LABELS, INVESTIGATION_STATUS_LABELS, RIDDOR_REVIEW_STATUS_LABELS, RISK_LEVEL_LABELS,
  docPath, humanise, PROTECT_PATHS, type DocKind, type RiskLevel,
} from '@/lib/hs/safetyVocab';
import { HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_TYPE_LABELS } from '@/lib/hs/vocab';
import { ACTION_STATUS_LABELS } from '@/lib/ui/statusMaps';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import RiskBadge from '@/components/safety/RiskBadge';

export const metadata: Metadata = { title: 'Safety analysis' };
export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

type KN = { k: string; n: number };
interface Breakdowns {
  period_from: string; period_to: string;
  hazards_by_category: KN[]; hazards_by_site: KN[]; hazards_by_status: KN[]; ra_by_status: KN[];
  overdue_assessments: { kind: DocKind; id: string; reference: string; title: string; review_date: string }[];
  high_residual_risks: { ra_id: string; reference: string; title: string; hazard: string; score: number; level: RiskLevel }[];
  incidents_by_type: KN[]; incidents_by_site: KN[]; incidents_by_severity: KN[];
  near_miss_trend: { k: string; n: number; incidents: number }[];
  investigations_by_status: KN[]; riddor_by_status: KN[];
  actions: { raised: number; complete: number; complete_on_time: number; open: number; overdue: number; awaiting_verification: number; cancelled: number };
  overdue_actions: { id: string; title: string; due_date: string; status: string; source_type: string; source_id: string | null }[];
}

// Management information (spec §77). Factual counts from
// hs_safety_breakdowns() (128), which runs with the viewer's own RLS in
// the organisation they are acting in. No forecasting, no scoring of
// people or sites (spec §85).
export default async function SafetyAnalysisPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  if (!ctx.companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  const f = { site: param(sp, 'site'), from: param(sp, 'from'), to: param(sp, 'to') };
  const [res, { sites }] = await Promise.all([
    ctx.supabase.rpc('hs_safety_breakdowns', {
      p_site: UUID.test(f.site) ? f.site : null, p_from: ISO.test(f.from) ? f.from : null, p_to: ISO.test(f.to) ? f.to : null,
    }),
    orgSitesAndDepartments(ctx.supabase, ctx.companyId),
  ]);
  const b = res.data as Breakdowns | null;

  return (
    <main className="portal-page flex-1 space-y-5">
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        Factual figures for this organisation. Registers show where things stand today; incidents and actions cover the period
        {b ? ` ${fmtDate(b.period_from)} – ${fmtDate(b.period_to)}` : ''}.
      </p>
      <FilterForm action="/protect/analysis" fields={[
        { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
        { name: 'from', label: 'From', type: 'date', value: f.from },
        { name: 'to', label: 'To', type: 'date', value: f.to },
      ]} />
      {res.error || !b ? (
        <SafetyEmpty icon={BarChart3} title="The figures could not be loaded" text="Refresh to try again. If it keeps happening, tell your H&S contact." />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="Hazards by category" file="hazards-by-category.csv" rows={b.hazards_by_category} />
            <Table title="Hazards by site" file="hazards-by-site.csv" rows={b.hazards_by_site} />
            <Table title="Hazards by status" file="hazards-by-status.csv" rows={b.hazards_by_status} label={k => HAZARD_STATUS_LABELS[k as keyof typeof HAZARD_STATUS_LABELS] ?? humanise(k)} />
            <Table title="Risk assessments by status" file="risk-assessments-by-status.csv" rows={b.ra_by_status} label={k => DOC_STATUS_LABELS[k as keyof typeof DOC_STATUS_LABELS] ?? humanise(k)} />
            <Table title="Incidents by type" file="incidents-by-type.csv" rows={b.incidents_by_type} label={k => HS_INCIDENT_TYPE_LABELS[k as keyof typeof HS_INCIDENT_TYPE_LABELS] ?? humanise(k)} />
            <Table title="Incidents by site" file="incidents-by-site.csv" rows={b.incidents_by_site} />
            <Table title="Incident severity (as confirmed)" file="incident-severity.csv" rows={b.incidents_by_severity}
              label={k => k === 'unconfirmed' ? 'Not yet confirmed' : HS_INCIDENT_SEVERITY_LABELS[k as keyof typeof HS_INCIDENT_SEVERITY_LABELS] ?? humanise(k)} />
            <Table title="Investigations by status" file="investigations-by-status.csv" rows={b.investigations_by_status} label={k => INVESTIGATION_STATUS_LABELS[k as keyof typeof INVESTIGATION_STATUS_LABELS] ?? humanise(k)} />
            <Table title="RIDDOR review status" file="riddor-review-status.csv" rows={b.riddor_by_status} label={k => RIDDOR_REVIEW_STATUS_LABELS[k as keyof typeof RIDDOR_REVIEW_STATUS_LABELS] ?? humanise(k)} />

            <section className="card p-4 space-y-2">
              <Head title="Near misses and incidents by month">
                <CsvButton filename="near-miss-trend.csv" rows={b.near_miss_trend.map(r => ({ month: r.k, near_misses: r.n, incidents: r.incidents }))}
                  columns={[{ key: 'month', label: 'Month' }, { key: 'near_misses', label: 'Near misses' }, { key: 'incidents', label: 'Incidents' }]} />
              </Head>
              {b.near_miss_trend.length === 0 ? <Nothing /> : (
                <table className="table text-sm"><thead><tr><th>Month</th><th className="text-right">Near misses</th><th className="text-right">Incidents</th></tr></thead>
                  <tbody>{b.near_miss_trend.map(r => <tr key={r.k}><td>{r.k}</td><td className="text-right">{r.n}</td><td className="text-right">{r.incidents}</td></tr>)}</tbody></table>
              )}
            </section>
          </div>

          <section className="card p-4 space-y-2">
            <Head title="Corrective action completion" />
            <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
              {([['Raised', b.actions.raised], ['Complete', b.actions.complete], ['Completed on time', b.actions.complete_on_time],
                 ['Open', b.actions.open], ['Overdue', b.actions.overdue], ['Awaiting verification', b.actions.awaiting_verification],
                 ['Cancelled', b.actions.cancelled]] as const).map(([l, v]) => (
                <div key={l}><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{l}</dt><dd className="font-display text-xl font-bold" style={{ color: 'var(--ink)' }}>{v}</dd></div>
              ))}
            </dl>
            {b.actions.raised > 0 && (
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {Math.round((b.actions.complete / b.actions.raised) * 100)}% of actions raised in the period are complete;
                {' '}{b.actions.complete ? Math.round((b.actions.complete_on_time / b.actions.complete) * 100) : 0}% of those on time.
              </p>
            )}
          </section>

          <section className="card p-4 space-y-2">
            <Head title="Overdue corrective actions">
              <CsvButton filename="overdue-actions.csv" rows={b.overdue_actions.map(a => ({ title: a.title, due: a.due_date, status: ACTION_STATUS_LABELS[a.status] ?? a.status, source: humanise(a.source_type) }))}
                columns={[{ key: 'title', label: 'Action' }, { key: 'due', label: 'Due' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'Raised from' }]} />
            </Head>
            {b.overdue_actions.length === 0 ? <Nothing text="No corrective action is overdue." /> : (
              <div className="table-wrapper"><table className="table text-sm"><thead><tr><th>Action</th><th>Due</th><th>Status</th><th>Raised from</th></tr></thead>
                <tbody>{b.overdue_actions.map(a => (
                  <tr key={a.id}><td>{a.title}</td><td style={{ color: 'var(--red)' }}>{fmtDate(a.due_date)}</td><td>{ACTION_STATUS_LABELS[a.status] ?? a.status}</td><td>{humanise(a.source_type)}</td></tr>
                ))}</tbody></table></div>
            )}
            <Link href={PROTECT_PATHS.actions} className="text-xs" style={{ color: 'var(--purple)' }}>Open the actions list →</Link>
          </section>

          <section className="card p-4 space-y-2">
            <Head title="High and very high residual risks">
              <CsvButton filename="high-residual-risks.csv" rows={b.high_residual_risks.map(r => ({ reference: r.reference, assessment: r.title, hazard: r.hazard, score: r.score, level: RISK_LEVEL_LABELS[r.level] }))}
                columns={[{ key: 'reference', label: 'Assessment' }, { key: 'assessment', label: 'Title' }, { key: 'hazard', label: 'Hazard' }, { key: 'score', label: 'Residual score' }, { key: 'level', label: 'Band' }]} />
            </Head>
            {b.high_residual_risks.length === 0 ? <Nothing text="No live assessment carries a high or very high residual risk." /> : (
              <div className="table-wrapper"><table className="table text-sm"><thead><tr><th>Assessment</th><th>Hazard</th><th>Residual risk</th></tr></thead>
                <tbody>{b.high_residual_risks.map((r, i) => (
                  <tr key={`${r.ra_id}-${i}`}><td><Link href={docPath('risk_assessment', r.ra_id)}>{r.reference}</Link> — {r.title}</td><td>{r.hazard}</td><td><RiskBadge score={r.score} level={r.level} /></td></tr>
                ))}</tbody></table></div>
            )}
          </section>

          <section className="card p-4 space-y-2">
            <Head title="Assessments past their review date">
              <CsvButton filename="overdue-assessments.csv" rows={b.overdue_assessments.map(a => ({ kind: humanise(a.kind), reference: a.reference, title: a.title, review: a.review_date }))}
                columns={[{ key: 'kind', label: 'Type' }, { key: 'reference', label: 'Reference' }, { key: 'title', label: 'Title' }, { key: 'review', label: 'Review date' }]} />
            </Head>
            {b.overdue_assessments.length === 0 ? <Nothing text="Every live assessment is within its review date." /> : (
              <ul className="text-sm space-y-1">{b.overdue_assessments.map(a => (
                <li key={a.id}><Link href={docPath(a.kind, a.id)}>{a.reference}</Link> — {a.title} <span style={{ color: 'var(--red)' }}>· review was due {fmtDate(a.review_date)}</span></li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Head({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="flex items-center gap-2"><h2 className="font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2><div className="ml-auto">{children}</div></div>;
}
function Nothing({ text = 'Nothing recorded in this period.' }: { text?: string }) {
  return <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{text}</p>;
}
function Table({ title, file, rows, label = (k: string) => k }: { title: string; file: string; rows: KN[]; label?: (k: string) => string }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <section className="card p-4 space-y-2">
      <Head title={title}>
        <CsvButton filename={file} rows={rows.map(r => ({ item: label(r.k), count: r.n }))} columns={[{ key: 'item', label: title }, { key: 'count', label: 'Count' }]} />
      </Head>
      {rows.length === 0 ? <Nothing /> : (
        <ul className="space-y-1.5 text-sm">
          {rows.map(r => (
            <li key={r.k}>
              <div className="flex justify-between"><span style={{ color: 'var(--ink)' }}>{label(r.k)}</span><span style={{ color: 'var(--ink-soft)' }}>{r.n}</span></div>
              <div className="h-1.5 rounded" style={{ background: 'var(--surface-alt)' }}>
                <div className="h-1.5 rounded" style={{ width: `${total ? Math.max(2, (r.n / total) * 100) : 0}%`, background: 'var(--purple)' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
