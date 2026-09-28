import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime } from '@/lib/hs/safetyContext';
import {
  CONTROL_CATEGORY_LABELS, CONTROL_EFFECTIVENESS_LABELS, CONTROL_TYPES, CONTROL_TYPE_LABELS, DOC_STATUS_LABELS, EXPOSURE_ROUTE_LABELS,
  GHS_PICTOGRAM_LABELS, PERSONS_AT_RISK_LABELS, humanise,
  type ControlCategory, type ControlEffectiveness, type ControlType, type DocStatus, type GhsPictogram, type PersonsAtRisk,
} from '@/lib/hs/safetyVocab';
import PrintShell, { PrintSection } from '@/components/safety/PrintShell';

export const metadata: Metadata = { title: 'COSHH assessment — print' };
export const dynamic = 'force-dynamic';

// Spec §81: substance, SDS information, hazards, exposure routes,
// use/task, controls, PPE/RPE, first aid, spill, storage, disposal,
// health surveillance, review date, approval.
export default async function CoshhPrintPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: c } = await supabase.from('coshh_assessments')
    .select('id, reference, version, title, site_id, substance_id, task_or_process, exposure_routes, persons_exposed, persons_exposed_notes, frequency, duration, quantity, existing_controls, ppe, first_aid, spill_response, disposal, health_surveillance_required, exposure_monitoring_required, emergency_arrangements, assessor_id, status, assessment_date, review_date, approved_by, approved_at')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!c) notFound();

  const [org, dir, { sites }, sub, controls] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('substances').select('reference, product_name, manufacturer, supplier, product_code, substance_type, sds_version, sds_date, hazard_statements, precautionary_statements, pictograms, pictograms_confirmed_at, storage_requirements, disposal_requirements, emergency_information').eq('id', c.substance_id).maybeSingle(),
    supabase.from('coshh_assessment_controls').select('id, control_title, control_type, control_category, effectiveness').eq('coshh_assessment_id', id).limit(500),
  ]);
  const s = sub.data as { reference: string; product_name: string; manufacturer: string | null; supplier: string | null; product_code: string | null;
    substance_type: string | null; sds_version: string | null; sds_date: string | null; hazard_statements: string[]; precautionary_statements: string[];
    pictograms: GhsPictogram[]; pictograms_confirmed_at: string | null; storage_requirements: string | null; disposal_requirements: string | null;
    emergency_information: string | null } | null;
  const ctl = ((controls.data ?? []) as { id: string; control_title: string; control_type: ControlType; control_category: ControlCategory | null; effectiveness: ControlEffectiveness }[])
    .sort((a, b) => CONTROL_TYPES.indexOf(a.control_type) - CONTROL_TYPES.indexOf(b.control_type));
  const status = c.status as DocStatus;
  const approved = c.approved_at ? `${nameOf(dir, c.approved_by)}, ${fmtDateTime(c.approved_at)}` : `Not approved (${DOC_STATUS_LABELS[status]})`;
  const text = (v: string | null | undefined) => v ? <p className="text-sm whitespace-pre-wrap">{v}</p> : <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Not recorded.</p>;
  const routes = (c.exposure_routes ?? []) as (keyof typeof EXPOSURE_ROUTE_LABELS)[];
  const persons = (c.persons_exposed ?? []) as PersonsAtRisk[];

  return (
    <PrintShell title={`COSHH assessment — ${c.title}`} organisation={(org.data?.name as string | undefined) ?? 'Organisation'}
      reference={`${c.reference} · version ${c.version}`}
      meta={[
        { label: 'Site', value: sites.find(x => x.id === c.site_id)?.name ?? '—' },
        { label: 'Assessor', value: nameOf(dir, c.assessor_id) },
        { label: 'Assessment date', value: fmtDate(c.assessment_date) },
        { label: 'Review date', value: fmtDate(c.review_date) },
        { label: 'Status', value: DOC_STATUS_LABELS[status] },
        { label: 'Approval', value: approved },
      ]}>
      <PrintSection title="Substance">
        {s ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Product</dt><dd>{s.product_name} ({s.reference})</dd></div>
            <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Product code</dt><dd>{s.product_code ?? '—'}</dd></div>
            <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Manufacturer / supplier</dt><dd>{[s.manufacturer, s.supplier].filter(Boolean).join(' / ') || '—'}</dd></div>
            <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Type</dt><dd>{s.substance_type ? humanise(s.substance_type) : '—'}</dd></div>
          </dl>
        ) : text(null)}
      </PrintSection>

      <PrintSection title="Safety data sheet">
        {s?.sds_version ? <p className="text-sm">Version {s.sds_version}, issued {fmtDate(s.sds_date)}.</p> : <p className="text-sm">No safety data sheet on file.</p>}
        {s?.emergency_information && <p className="text-sm whitespace-pre-wrap"><strong>Emergency information:</strong> {s.emergency_information}</p>}
      </PrintSection>

      <PrintSection title="Hazards">
        {s && s.pictograms.length > 0 && (
          <p className="text-sm"><strong>Pictograms:</strong> {s.pictograms.map(p => `${p} ${GHS_PICTOGRAM_LABELS[p]}`).join(', ')}
            {s.pictograms_confirmed_at ? ` (confirmed against the SDS ${fmtDate(s.pictograms_confirmed_at)})` : ''}</p>
        )}
        {s && s.hazard_statements.length > 0
          ? <ul className="text-sm list-disc pl-5">{s.hazard_statements.map((h, i) => <li key={i}>{h}</li>)}</ul>
          : <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No hazard statements recorded.</p>}
        {s && s.precautionary_statements.length > 0 && (
          <><p className="text-sm font-semibold">Precautionary statements</p>
            <ul className="text-sm list-disc pl-5">{s.precautionary_statements.map((h, i) => <li key={i}>{h}</li>)}</ul></>
        )}
      </PrintSection>

      <PrintSection title="Exposure routes">
        <p className="text-sm">{routes.length ? routes.map(r => EXPOSURE_ROUTE_LABELS[r]).join(', ') : 'Not recorded.'}</p>
        <p className="text-sm"><strong>Persons exposed:</strong> {persons.length ? persons.map(p => PERSONS_AT_RISK_LABELS[p]).join(', ') : 'Not recorded'}
          {c.persons_exposed_notes ? ` — ${c.persons_exposed_notes}` : ''}</p>
      </PrintSection>

      <PrintSection title="Use / task">
        {text(c.task_or_process)}
        <p className="text-sm">
          <strong>Frequency:</strong> {c.frequency ?? '—'} · <strong>Duration:</strong> {c.duration ?? '—'} · <strong>Quantity:</strong> {c.quantity ?? '—'}
        </p>
      </PrintSection>

      <PrintSection title="Controls">
        {ctl.length > 0 && (
          <table className="table text-sm">
            <thead><tr><th>Control</th><th>Hierarchy</th><th>Category</th><th>Effectiveness</th></tr></thead>
            <tbody>{ctl.map(r => (
              <tr key={r.id}><td>{r.control_title}</td><td>{CONTROL_TYPE_LABELS[r.control_type]}</td>
                <td>{r.control_category ? CONTROL_CATEGORY_LABELS[r.control_category] : '—'}</td><td>{CONTROL_EFFECTIVENESS_LABELS[r.effectiveness]}</td></tr>
            ))}</tbody>
          </table>
        )}
        {c.existing_controls ? text(c.existing_controls) : ctl.length === 0 && text(null)}
      </PrintSection>

      <PrintSection title="PPE / RPE">{text(c.ppe)}</PrintSection>
      <PrintSection title="First aid">{text(c.first_aid)}</PrintSection>
      <PrintSection title="Spill response">{text(c.spill_response)}</PrintSection>
      <PrintSection title="Storage">{text(s?.storage_requirements)}</PrintSection>
      <PrintSection title="Disposal">{text(c.disposal ?? s?.disposal_requirements)}</PrintSection>
      <PrintSection title="Health surveillance">
        <p className="text-sm">Health surveillance {c.health_surveillance_required ? 'is required' : 'is not required'}.
          Exposure monitoring {c.exposure_monitoring_required ? 'is required' : 'is not required'}.</p>
        {c.emergency_arrangements && <p className="text-sm whitespace-pre-wrap"><strong>Emergency arrangements:</strong> {c.emergency_arrangements}</p>}
      </PrintSection>
      <PrintSection title="Review date">
        <p className="text-sm">{fmtDate(c.review_date)}</p>
      </PrintSection>
      <PrintSection title="Approval">
        <p className="text-sm">{approved}. Version {c.version}.</p>
      </PrintSection>
    </PrintShell>
  );
}
