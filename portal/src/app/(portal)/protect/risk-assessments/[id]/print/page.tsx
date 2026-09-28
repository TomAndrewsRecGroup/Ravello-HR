import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime } from '@/lib/hs/safetyContext';
import {
  CONTROL_EFFECTIVENESS_LABELS, CONTROL_TYPES, CONTROL_TYPE_LABELS, DOC_STATUS_LABELS, PERSONS_AT_RISK_LABELS, RISK_ITEM_STATUS_LABELS,
} from '@/lib/hs/safetyVocab';
import { riskBand } from '@/lib/hs/riskMatrix';
import { readAllPages } from '@/lib/supabase/paged';
import PrintShell, { PrintSection } from '@/components/safety/PrintShell';
import RiskBadge from '@/components/safety/RiskBadge';
import RiskMatrixGrid from '../RiskMatrixGrid';
import { RA_COLUMNS, type MatrixRow, type RaItem, type RaItemControl, type RaRow } from '../raTypes';

export const metadata: Metadata = { title: 'Risk assessment — print' };
export const dynamic = 'force-dynamic';

// The printable risk assessment (spec §79): organisation, site, title,
// activity, assessor, date, review date, then every hazard with the
// persons at risk, initial risk, controls, further actions and residual
// risk, then approval and version. Structured HTML; the browser's print
// dialog saves it as PDF.
export default async function RiskAssessmentPrintPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: raData } = await supabase.from('risk_assessments').select(RA_COLUMNS).eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!raData) notFound();
  const ra = raData as unknown as RaRow;

  const [dir, { sites, departments }, org, type, matrix, items] = await Promise.all([
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
    ra.assessment_type_id ? supabase.from('assessment_types').select('name').eq('id', ra.assessment_type_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('risk_matrices').select('id, name, company_id, is_default, likelihood_labels, severity_labels, bands').eq('id', ra.risk_matrix_id).maybeSingle(),
    supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id, hazard_description, persons_at_risk, persons_at_risk_notes, existing_controls, likelihood_before, severity_before, initial_risk_score, further_controls_required, likelihood_after, severity_after, residual_risk_score, owner_id, due_date, status, sort_order')
      .eq('risk_assessment_id', id).order('sort_order').order('created_at').limit(200),
  ]);
  const m = matrix.data as MatrixRow | null;
  if (!m) notFound();
  const itemRows = (items.data ?? []) as RaItem[];
  const itemIds = itemRows.map(i => i.id);
  const controls = itemIds.length
    ? (await readAllPages<RaItemControl>((from, to) => supabase.from('risk_item_controls')
        .select('id, risk_assessment_item_id, control_id, stage, control_title, control_type, effectiveness, effectiveness_recorded_by, effectiveness_recorded_at, notes')
        .in('risk_assessment_item_id', itemIds).order('id').range(from, to))).rows
    : [];
  const orgName = (org.data?.name as string | undefined) ?? 'Organisation';
  const siteName = sites.find(s => s.id === ra.site_id)?.name ?? 'Not site-specific';
  const deptName = departments.find(d => d.id === ra.department_id)?.name;

  const approved = !!ra.approved_at;
  const statusNote = approved ? DOC_STATUS_LABELS[ra.status] : `${DOC_STATUS_LABELS[ra.status]} — NOT APPROVED`;

  return (
    <PrintShell
      title={ra.title}
      organisation={`${orgName} · Risk assessment`}
      reference={`${ra.reference} · Version ${ra.version}`}
      meta={[
        { label: 'Organisation', value: orgName },
        { label: 'Site', value: siteName + (deptName ? ` · ${deptName}` : '') },
        { label: 'Assessment type', value: (type.data?.name as string | undefined) ?? '—' },
        { label: 'Status', value: statusNote },
        { label: 'Assessor', value: ra.assessor_id ? nameOf(dir, ra.assessor_id) : '—' },
        { label: 'Responsible manager', value: ra.responsible_manager_id ? nameOf(dir, ra.responsible_manager_id) : '—' },
        { label: 'Assessment date', value: fmtDate(ra.assessment_date) },
        { label: 'Review date', value: fmtDate(ra.review_date) },
      ]}
    >
      <PrintSection title="Activity">
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{ra.activity_or_process || '—'}</p>
        {ra.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{ra.description}</p>}
      </PrintSection>

      <PrintSection title="Hazards, controls and risk">
        {itemRows.length === 0 ? <p className="text-sm">No hazards recorded.</p> : (
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ink)' }}>
                {['#', 'Hazard', 'Persons at risk', 'Initial risk', 'Controls', 'Further actions', 'Residual risk'].map(h => (
                  <th key={h} className="text-left p-1 align-bottom" style={{ color: 'var(--ink-soft)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemRows.map((it, n) => {
                const ib = riskBand(m, it.initial_risk_score);
                const rb = riskBand(m, it.residual_risk_score);
                const cs = controls.filter(c => c.risk_assessment_item_id === it.id)
                  .sort((a, b) => CONTROL_TYPES.indexOf(a.control_type) - CONTROL_TYPES.indexOf(b.control_type));
                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid var(--line)', pageBreakInside: 'avoid' }}>
                    <td className="p-1 align-top">{n + 1}</td>
                    <td className="p-1 align-top whitespace-pre-wrap">{it.hazard_description}</td>
                    <td className="p-1 align-top">
                      {it.persons_at_risk.map(p => PERSONS_AT_RISK_LABELS[p]).join(', ') || '—'}
                      {it.persons_at_risk_notes && <div style={{ color: 'var(--ink-soft)' }}>{it.persons_at_risk_notes}</div>}
                    </td>
                    <td className="p-1 align-top whitespace-nowrap">
                      <RiskBadge score={it.initial_risk_score} level={ib?.level} label={ib?.label} />
                      <div style={{ color: 'var(--ink-faint)' }}>L{it.likelihood_before} {m.likelihood_labels[it.likelihood_before - 1]}<br />S{it.severity_before} {m.severity_labels[it.severity_before - 1]}</div>
                    </td>
                    <td className="p-1 align-top">
                      {it.existing_controls && <p className="whitespace-pre-wrap">{it.existing_controls}</p>}
                      {cs.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {cs.map(c => (
                            <li key={c.id}>
                              <strong>{CONTROL_TYPE_LABELS[c.control_type]}</strong>{c.stage === 'additional' ? ' (additional)' : ''}: {c.control_title}
                              <span style={{ color: 'var(--ink-faint)' }}> — {CONTROL_EFFECTIVENESS_LABELS[c.effectiveness]}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!it.existing_controls && cs.length === 0 && '—'}
                    </td>
                    <td className="p-1 align-top">
                      <p className="whitespace-pre-wrap">{it.further_controls_required || '—'}</p>
                      {(it.owner_id || it.due_date) && (
                        <p style={{ color: 'var(--ink-soft)' }}>Owner: {nameOf(dir, it.owner_id)} · Due: {fmtDate(it.due_date)} · {RISK_ITEM_STATUS_LABELS[it.status]}</p>
                      )}
                    </td>
                    <td className="p-1 align-top whitespace-nowrap">
                      {it.residual_risk_score != null ? (
                        <>
                          <RiskBadge score={it.residual_risk_score} level={rb?.level} label={rb?.label} />
                          <div style={{ color: 'var(--ink-faint)' }}>L{it.likelihood_after} {m.likelihood_labels[(it.likelihood_after ?? 1) - 1]}<br />S{it.severity_after} {m.severity_labels[(it.severity_after ?? 1) - 1]}</div>
                        </>
                      ) : 'Not rated'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PrintSection>

      {itemRows.length > 0 && (
        <PrintSection title={`Risk matrix — ${m.name}`}>
          <RiskMatrixGrid matrix={m} items={itemRows.map((i, n) => ({ n: n + 1, lb: i.likelihood_before, sb: i.severity_before, la: i.likelihood_after, sa: i.severity_after }))} />
        </PrintSection>
      )}

      <PrintSection title="Approval">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt style={{ color: 'var(--ink-faint)' }}>Status</dt><dd>{statusNote}</dd>
          <dt style={{ color: 'var(--ink-faint)' }}>Submitted</dt><dd>{ra.submitted_at ? `${nameOf(dir, ra.submitted_by)} · ${fmtDateTime(ra.submitted_at)}` : '—'}</dd>
          <dt style={{ color: 'var(--ink-faint)' }}>Approved</dt><dd>{approved ? `${nameOf(dir, ra.approved_by)} · ${fmtDateTime(ra.approved_at)}` : 'Not approved'}</dd>
          {ra.last_reviewed_at && <><dt style={{ color: 'var(--ink-faint)' }}>Last reviewed</dt><dd>{nameOf(dir, ra.last_reviewed_by)} · {fmtDateTime(ra.last_reviewed_at)}</dd></>}
          <dt style={{ color: 'var(--ink-faint)' }}>Version</dt><dd>{ra.reference} v{ra.version}{ra.superseded_at ? ` — superseded ${fmtDate(ra.superseded_at)}` : ''}</dd>
          <dt style={{ color: 'var(--ink-faint)' }}>Next review</dt><dd>{fmtDate(ra.review_date)}</dd>
        </dl>
      </PrintSection>
    </PrintShell>
  );
}
