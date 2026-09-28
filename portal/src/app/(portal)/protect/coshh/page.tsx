import type { Metadata } from 'next';
import Link from 'next/link';
import { FlaskConical, Plus } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, param, fmtDate, todayIso } from '@/lib/hs/safetyContext';
import {
  DOC_STATUSES, DOC_STATUS_LABELS, GHS_PICTOGRAM_LABELS, SUBSTANCE_STATUSES, SUBSTANCE_TYPES, docPath, humanise,
  type DocStatus, type GhsPictogram,
} from '@/lib/hs/safetyVocab';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { toneFor } from '@/components/safety/Pill';

export const metadata: Metadata = { title: 'COSHH' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;

// The COSHH register (124): hazardous substances with their current
// safety data sheet, and the COSHH assessments of how each is used.
// Pictograms are what a person confirmed from the SDS — never inferred.
export default async function CoshhRegisterPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  if (!ctx.can('risk.read')) {
    return <main className="portal-page flex-1"><p className="card p-4 text-sm">You do not have access to the COSHH register in this organisation.</p></main>;
  }

  const f = { q: param(sp, 'q'), sstatus: param(sp, 'sstatus'), stype: param(sp, 'stype'), status: param(sp, 'status'),
    site: param(sp, 'site'), overdue: param(sp, 'overdue') };
  const today = todayIso();
  const pat = f.q ? `%${f.q.replace(/[%_\\,()]/g, ' ')}%` : '';

  let sq = supabase.from('substances')
    .select('id, reference, product_name, manufacturer, supplier, product_code, substance_type, pictograms, pictograms_confirmed_at, sds_version, sds_date, active_status', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.sstatus) sq = sq.eq('active_status', f.sstatus); else sq = sq.neq('active_status', 'archived');
  if (f.stype) sq = sq.eq('substance_type', f.stype);
  if (pat) sq = sq.or(`reference.ilike.${pat},product_name.ilike.${pat},manufacturer.ilike.${pat},supplier.ilike.${pat},product_code.ilike.${pat}`);

  let aq = supabase.from('coshh_assessments')
    .select('id, reference, version, title, substance_id, status, review_date, review_reason, assessor_id, site_id', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status) aq = aq.eq('status', f.status); else aq = aq.not('status', 'in', '(superseded,archived)');
  if (f.site) aq = aq.eq('site_id', f.site);
  if (f.overdue === '1') aq = aq.lt('review_date', today).in('status', ['approved', 'active', 'review_due']);
  if (pat) aq = aq.or(`reference.ilike.${pat},title.ilike.${pat}`);

  const [subsRes, assessRes, { sites }, dir] = await Promise.all([
    sq.order('product_name').limit(LIMIT),
    aq.order('updated_at', { ascending: false }).limit(LIMIT),
    orgSitesAndDepartments(supabase, companyId),
    orgDirectory(supabase),
  ]);
  const subs = (subsRes.data ?? []) as { id: string; reference: string; product_name: string; manufacturer: string | null; supplier: string | null;
    product_code: string | null; substance_type: string | null; pictograms: GhsPictogram[]; pictograms_confirmed_at: string | null;
    sds_version: string | null; sds_date: string | null; active_status: string }[];
  const assess = (assessRes.data ?? []) as { id: string; reference: string; version: number; title: string; substance_id: string; status: DocStatus;
    review_date: string | null; review_reason: string | null; assessor_id: string | null; site_id: string | null }[];

  // Substance names for assessments whose substance is filtered out of the list above.
  const known = new Map(subs.map(s => [s.id, s.product_name]));
  const missing = [...new Set(assess.map(a => a.substance_id).filter(id => !known.has(id)))];
  if (missing.length) {
    const { data } = await supabase.from('substances').select('id, product_name').in('id', missing).limit(LIMIT);
    for (const s of data ?? []) known.set(s.id as string, s.product_name as string);
  }
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const canCreate = ctx.can('risk.create');
  const filtered = Object.values(f).some(Boolean);

  const subCsv = subs.map(s => ({
    reference: s.reference, product: s.product_name, manufacturer: s.manufacturer ?? '', supplier: s.supplier ?? '', code: s.product_code ?? '',
    type: humanise(s.substance_type), pictograms: s.pictograms.map(p => `${p} ${GHS_PICTOGRAM_LABELS[p]}`), sds: s.sds_version ?? '',
    sds_date: s.sds_date ?? '', status: humanise(s.active_status),
  }));
  const assessCsv = assess.map(a => ({
    reference: a.reference, version: a.version, title: a.title, substance: known.get(a.substance_id) ?? '', status: DOC_STATUS_LABELS[a.status],
    review: a.review_date ?? '', reason: a.review_reason ?? '', assessor: a.assessor_id ? nameOf(dir, a.assessor_id) : '',
    site: a.site_id ? siteName.get(a.site_id) ?? '' : '',
  }));

  return (
    <main className="portal-page flex-1 space-y-4">
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        Hazardous substances used by this organisation, their safety data sheets, and the assessments of how they are used.
      </p>

      <FilterForm fields={[
        { name: 'q', label: 'Search', type: 'search', value: f.q },
        { name: 'sstatus', label: 'Substance status', value: f.sstatus, options: SUBSTANCE_STATUSES.map(s => ({ value: s, label: humanise(s) })) },
        { name: 'stype', label: 'Substance type', value: f.stype, options: SUBSTANCE_TYPES.map(s => ({ value: s, label: humanise(s) })) },
        { name: 'status', label: 'Assessment status', value: f.status, options: DOC_STATUSES.map(s => ({ value: s, label: DOC_STATUS_LABELS[s] })) },
        { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
        { name: 'overdue', label: 'Review overdue', type: 'checkbox', value: f.overdue },
      ]} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Substances</h2>
          <div className="ml-auto flex gap-2">
            <CsvButton filename="substances.csv" rows={subCsv} columns={[
              { key: 'reference', label: 'Reference' }, { key: 'product', label: 'Product' }, { key: 'manufacturer', label: 'Manufacturer' },
              { key: 'supplier', label: 'Supplier' }, { key: 'code', label: 'Product code' }, { key: 'type', label: 'Type' },
              { key: 'pictograms', label: 'Pictograms' }, { key: 'sds', label: 'SDS version' }, { key: 'sds_date', label: 'SDS date' },
              { key: 'status', label: 'Status' },
            ]} />
            {canCreate && <Link href="/protect/substances/new" className="btn-cta btn-sm" style={{ minHeight: 40 }}><Plus size={14} /> Add substance</Link>}
          </div>
        </div>
        {subsRes.error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Substances could not be loaded. Refresh to try again.</p>}
        {(subsRes.count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing {LIMIT} of {subsRes.count}.</p>}
        {subs.length === 0 ? (
          <SafetyEmpty icon={FlaskConical} title="No substances on the register"
            text={filtered ? 'Nothing matches these filters.' : 'List each hazardous product used here, with its safety data sheet, then assess how it is used.'} />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Ref</th><th>Product</th><th>Manufacturer / supplier</th><th>Type</th><th>Pictograms</th><th>Current SDS</th><th>Status</th></tr></thead>
              <tbody>
                {subs.map(s => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs whitespace-nowrap"><Link href={`/protect/substances/${s.id}`}>{s.reference}</Link></td>
                    <td><Link href={`/protect/substances/${s.id}`} style={{ color: 'var(--ink)' }}>{s.product_name}</Link>
                      {s.product_code && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{s.product_code}</div>}</td>
                    <td className="text-sm">{[s.manufacturer, s.supplier].filter(Boolean).join(' / ') || '—'}</td>
                    <td>{s.substance_type ? humanise(s.substance_type) : '—'}</td>
                    <td>
                      {s.pictograms.length === 0 ? <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>None recorded</span> : (
                        <span className="flex flex-wrap gap-1">
                          {s.pictograms.map(p => <Pill key={p} tone="warn" title={`${p}: confirmed from the SDS ${fmtDate(s.pictograms_confirmed_at)}`}>{p} {GHS_PICTOGRAM_LABELS[p]}</Pill>)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{s.sds_version ? `${s.sds_version} · ${fmtDate(s.sds_date)}` : <span style={{ color: 'var(--gold)' }}>No SDS</span>}</td>
                    <td><Pill tone={s.active_status === 'active' ? 'good' : 'muted'}>{humanise(s.active_status)}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>COSHH assessments</h2>
          <div className="ml-auto flex gap-2">
            <CsvButton filename="coshh-assessments.csv" rows={assessCsv} columns={[
              { key: 'reference', label: 'Reference' }, { key: 'version', label: 'Version' }, { key: 'title', label: 'Title' },
              { key: 'substance', label: 'Substance' }, { key: 'status', label: 'Status' }, { key: 'review', label: 'Review date' },
              { key: 'reason', label: 'Review reason' }, { key: 'assessor', label: 'Assessor' }, { key: 'site', label: 'Site' },
            ]} />
            {canCreate && <Link href="/protect/coshh/new" className="btn-cta btn-sm" style={{ minHeight: 40 }}><Plus size={14} /> New COSHH assessment</Link>}
          </div>
        </div>
        {assessRes.error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>COSHH assessments could not be loaded. Refresh to try again.</p>}
        {(assessRes.count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing {LIMIT} of {assessRes.count}.</p>}
        {assess.length === 0 ? (
          <SafetyEmpty icon={FlaskConical} title="No COSHH assessments"
            text={filtered ? 'Nothing matches these filters.' : 'Assess how each hazardous substance is used: who is exposed, how, and the controls in place.'} />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Ref</th><th>Title</th><th>Substance</th><th>Status</th><th>Review</th><th>Assessor</th></tr></thead>
              <tbody>
                {assess.map(a => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs whitespace-nowrap"><Link href={docPath('coshh_assessment', a.id)}>{a.reference} v{a.version}</Link></td>
                    <td><Link href={docPath('coshh_assessment', a.id)} style={{ color: 'var(--ink)' }}>{a.title}</Link>
                      {a.site_id && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{siteName.get(a.site_id)}</div>}</td>
                    <td>{known.get(a.substance_id) ? <Link href={`/protect/substances/${a.substance_id}`}>{known.get(a.substance_id)}</Link> : '—'}</td>
                    <td>
                      <Pill tone={toneFor(a.status)}>{DOC_STATUS_LABELS[a.status]}</Pill>
                      {a.status === 'review_due' && a.review_reason === 'sds_change' && <div className="text-xs mt-1" style={{ color: 'var(--red)' }}>New SDS</div>}
                    </td>
                    <td className="whitespace-nowrap">
                      {fmtDate(a.review_date)}
                      {a.review_date && a.review_date < today && ['approved', 'active', 'review_due'].includes(a.status) && <div><Pill tone="bad">Overdue</Pill></div>}
                    </td>
                    <td>{a.assessor_id ? nameOf(dir, a.assessor_id) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
