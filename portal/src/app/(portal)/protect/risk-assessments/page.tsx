import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardCheck, Plus } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, param, fmtDate, todayIso } from '@/lib/hs/safetyContext';
import { DOC_STATUSES, DOC_STATUS_LABELS, DOC_LIVE_STATUSES, RISK_LEVEL_LABELS, docPath, type DocStatus } from '@/lib/hs/safetyVocab';
import { riskBand, type RiskMatrix } from '@/lib/hs/riskMatrix';
import { readAllPages } from '@/lib/supabase/paged';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { toneFor } from '@/components/safety/Pill';
import RiskBadge from '@/components/safety/RiskBadge';

export const metadata: Metadata = { title: 'Risk assessments' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;
const CHUNK = 100;

interface Row {
  id: string; reference: string; version: number; title: string; status: DocStatus; assessment_type_id: string | null;
  site_id: string | null; assessor_id: string | null; review_date: string | null; risk_matrix_id: string; updated_at: string;
}

// The risk assessment register (123). One row per VERSION; superseded
// and archived versions stay available but are hidden unless the status
// filter asks for them. "Highest residual" is the worst residual rating
// among the assessment's hazards, banded with that assessment's OWN
// matrix — never a single ambiguous "risk score".
export default async function RiskAssessmentsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const today = todayIso();
  const f = { q: param(sp, 'q'), status: param(sp, 'status'), type: param(sp, 'type'), site: param(sp, 'site'),
    assessor: param(sp, 'assessor'), overdue: param(sp, 'overdue') };

  let q = supabase.from('risk_assessments')
    .select('id, reference, version, title, status, assessment_type_id, site_id, assessor_id, review_date, risk_matrix_id, updated_at', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status) q = q.eq('status', f.status); else q = q.not('status', 'in', '(superseded,archived)');
  if (f.type) q = q.eq('assessment_type_id', f.type);
  if (f.site) q = q.eq('site_id', f.site);
  if (f.assessor) q = f.assessor === 'none' ? q.is('assessor_id', null) : q.eq('assessor_id', f.assessor);
  if (f.overdue === '1') q = q.lt('review_date', today).in('status', [...DOC_LIVE_STATUSES]);
  if (f.q) {
    const pat = `%${f.q.replace(/[%_\\,()]/g, ' ')}%`;
    q = q.or(`reference.ilike.${pat},title.ilike.${pat}`);
  }

  const [{ data, count, error }, types, { sites }, dir] = await Promise.all([
    q.order('updated_at', { ascending: false }).limit(LIMIT),
    supabase.from('assessment_types').select('id, name').eq('active', true).order('sort_order').limit(200),
    orgSitesAndDepartments(supabase, companyId),
    orgDirectory(supabase),
  ]);
  const rows = (data ?? []) as Row[];

  // Worst residual per assessment: every item of the listed assessments,
  // read in pages, 100 assessment ids per request to keep URLs short.
  const ids = rows.map(r => r.id);
  const matrixIds = [...new Set(rows.map(r => r.risk_matrix_id))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const [itemResults, matrices] = await Promise.all([
    Promise.all(chunks.map(c => readAllPages<{ risk_assessment_id: string; residual_risk_score: number | null }>((from, to) =>
      supabase.from('risk_assessment_items')
        .select('risk_assessment_id, residual_risk_score')
        .in('risk_assessment_id', c)
        .order('id')
        .range(from, to)))),
    matrixIds.length
      ? supabase.from('risk_matrices').select('id, likelihood_labels, severity_labels, bands').in('id', matrixIds).limit(200)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const worst = new Map<string, number | null>();
  for (const res of itemResults) {
    for (const it of res.rows) {
      const prev = worst.get(it.risk_assessment_id);
      if (it.residual_risk_score == null) { if (prev === undefined) worst.set(it.risk_assessment_id, null); continue; }
      if (prev == null || it.residual_risk_score > prev) worst.set(it.risk_assessment_id, it.residual_risk_score);
    }
  }
  const matrixById = new Map(((matrices.data ?? []) as (RiskMatrix & { id: string })[]).map(m => [m.id, m]));
  const typeName = new Map((types.data ?? []).map(t => [t.id as string, t.name as string]));
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const isLive = (s: DocStatus) => (DOC_LIVE_STATUSES as readonly string[]).includes(s);
  const overdue = (r: Row) => !!r.review_date && r.review_date < today && isLive(r.status);

  const residualOf = (r: Row) => {
    const score = worst.get(r.id);
    const m = matrixById.get(r.risk_matrix_id);
    const band = m && score != null ? riskBand(m, score) : null;
    return { score, band, hasItems: worst.has(r.id) };
  };

  const csvRows = rows.map(r => {
    const { score, band } = residualOf(r);
    return {
      reference: r.reference, version: r.version, title: r.title, type: typeName.get(r.assessment_type_id ?? '') ?? '',
      site: r.site_id ? siteName.get(r.site_id) ?? '' : '', status: DOC_STATUS_LABELS[r.status],
      assessor: r.assessor_id ? nameOf(dir, r.assessor_id) : '', review: r.review_date ?? '',
      overdue: overdue(r) ? 'Yes' : '', residual: score ?? '', residual_band: band ? band.label : '',
    };
  });

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Structured risk assessments: every hazard with its initial risk, the controls in place and the residual risk that remains.
        </p>
        <div className="ml-auto flex gap-2">
          <CsvButton filename="risk-assessments.csv" rows={csvRows} columns={[
            { key: 'reference', label: 'Reference' }, { key: 'version', label: 'Version' }, { key: 'title', label: 'Title' },
            { key: 'type', label: 'Type' }, { key: 'site', label: 'Site' }, { key: 'status', label: 'Status' },
            { key: 'assessor', label: 'Assessor' }, { key: 'review', label: 'Review date' }, { key: 'overdue', label: 'Review overdue' },
            { key: 'residual', label: 'Highest residual score' }, { key: 'residual_band', label: 'Highest residual band' },
          ]} />
          {ctx.can('risk.create') && (
            <Link href="/protect/risk-assessments/new" className="btn-cta btn-sm" style={{ minHeight: 40 }}><Plus size={14} /> New risk assessment</Link>
          )}
        </div>
      </div>

      <FilterForm fields={[
        { name: 'q', label: 'Search', type: 'search', value: f.q },
        { name: 'status', label: 'Status', value: f.status, options: DOC_STATUSES.map(s => ({ value: s, label: DOC_STATUS_LABELS[s] })) },
        { name: 'type', label: 'Assessment type', value: f.type, options: (types.data ?? []).map(t => ({ value: t.id as string, label: t.name as string })) },
        { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
        { name: 'assessor', label: 'Assessor', value: f.assessor, options: [{ value: 'none', label: 'No assessor yet' }, ...dir.map(p => ({ value: p.user_id, label: p.full_name }))] },
        { name: 'overdue', label: 'Review overdue', type: 'checkbox', value: f.overdue },
      ]} />

      {!f.status && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Superseded and archived versions are hidden. Choose them under Status to see them.</p>}
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Risk assessments could not be loaded. Refresh to try again.</p>}
      {(count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing the {LIMIT} most recently updated of {count}. Narrow the filters to see the rest.</p>}

      {rows.length === 0 ? (
        <SafetyEmpty icon={ClipboardCheck} title="No risk assessments yet"
          text={Object.values(f).some(Boolean)
            ? 'Nothing matches these filters.'
            : 'Start a risk assessment from a template or from scratch. Each hazard is rated before and after controls, then reviewed and approved by someone other than the assessor.'}>
          {ctx.can('risk.create') && !Object.values(f).some(Boolean) && (
            <Link href="/protect/risk-assessments/new" className="btn-cta btn-sm"><Plus size={14} /> New risk assessment</Link>
          )}
        </SafetyEmpty>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Ref</th><th>Title</th><th>Type</th><th>Site</th><th>Status</th><th>Assessor</th><th>Review date</th><th>Highest residual risk</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const { score, band, hasItems } = residualOf(r);
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-xs whitespace-nowrap"><Link href={docPath('risk_assessment', r.id)}>{r.reference}</Link> <span style={{ color: 'var(--ink-faint)' }}>v{r.version}</span></td>
                    <td><Link href={docPath('risk_assessment', r.id)} style={{ color: 'var(--ink)' }}>{r.title}</Link></td>
                    <td>{typeName.get(r.assessment_type_id ?? '') ?? '—'}</td>
                    <td>{r.site_id ? siteName.get(r.site_id) ?? '—' : '—'}</td>
                    <td><Pill tone={toneFor(r.status)}>{DOC_STATUS_LABELS[r.status]}</Pill></td>
                    <td>{r.assessor_id ? nameOf(dir, r.assessor_id) : <span style={{ color: 'var(--gold)' }}>Not named</span>}</td>
                    <td className="whitespace-nowrap" style={overdue(r) ? { color: 'var(--red)', fontWeight: 600 } : undefined}>
                      {fmtDate(r.review_date)}{overdue(r) ? ' · overdue' : ''}
                    </td>
                    <td>
                      {score != null
                        ? <RiskBadge score={score} level={band?.level} label={band?.label ?? (band ? RISK_LEVEL_LABELS[band.level] : null)} />
                        : <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{hasItems ? 'Residual not yet rated' : 'No hazards yet'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
