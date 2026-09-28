import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime } from '@/lib/hs/safetyContext';
import { DOC_STATUS_LABELS, type DocStatus, type RamsSectionKey } from '@/lib/hs/safetyVocab';
import PrintShell, { PrintSection } from '@/components/safety/PrintShell';

export const metadata: Metadata = { title: 'RAMS — print' };
export const dynamic = 'force-dynamic';

const empty = { data: [] as Record<string, unknown>[] };

// Spec §80: client / organisation, site / project, work scope, method
// sequence, hazards, controls, PPE, equipment, COSHH links, emergency
// arrangements, responsible persons, approval, version.
export default async function RamsPrintPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: ms } = await supabase.from('method_statements')
    .select('id, reference, version, title, project_name, description, scope_of_work, sections, site_id, author_id, responsible_manager_id, status, start_date, end_date, review_date, approved_by, approved_at')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!ms) notFound();

  const [org, dir, { sites }, steps, links] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('method_statement_steps').select('id, sequence_number, title, description, hazards, controls, responsible_role').eq('method_statement_id', id).order('sequence_number').limit(500),
    supabase.from('hs_links').select('from_type, from_id, to_type, to_id').or(`and(from_type.eq.method_statement,from_id.eq.${id}),and(to_type.eq.method_statement,to_id.eq.${id})`).limit(500),
  ]);
  const linked = (links.data ?? []).map(l => (l.from_type === 'method_statement' && l.from_id === id ? { type: l.to_type as string, id: l.to_id as string } : { type: l.from_type as string, id: l.from_id as string }));
  const ids = (t: string) => linked.filter(l => l.type === t).map(l => l.id);
  const [coshh, ras] = await Promise.all([
    ids('coshh_assessment').length ? supabase.from('coshh_assessments').select('id, reference, version, title, status, substance_id').in('id', ids('coshh_assessment')).limit(500) : Promise.resolve(empty),
    ids('risk_assessment').length ? supabase.from('risk_assessments').select('id, reference, version, title, status').in('id', ids('risk_assessment')).limit(500) : Promise.resolve(empty),
  ]);
  const subIds = [...new Set((coshh.data ?? []).map(c => c.substance_id as string))];
  const subs = subIds.length ? await supabase.from('substances').select('id, product_name').in('id', subIds).limit(500) : empty;
  const subName = new Map((subs.data ?? []).map(s => [s.id as string, s.product_name as string]));

  const s = (ms.sections ?? {}) as Partial<Record<RamsSectionKey, string>>;
  const stepRows = (steps.data ?? []) as { id: string; sequence_number: number; title: string; description: string | null; hazards: string | null; controls: string | null; responsible_role: string | null }[];
  const status = ms.status as DocStatus;
  const approved = ms.approved_at ? `${nameOf(dir, ms.approved_by)}, ${fmtDateTime(ms.approved_at)}` : `Not approved (${DOC_STATUS_LABELS[status]})`;
  const roles = [...new Set(stepRows.map(r => r.responsible_role).filter(Boolean))] as string[];
  const text = (v: string | null | undefined) => v ? <p className="text-sm whitespace-pre-wrap">{v}</p> : <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Not recorded.</p>;

  return (
    <PrintShell title={`Risk Assessment and Method Statement — ${ms.title}`} organisation={(org.data?.name as string | undefined) ?? 'Organisation'}
      reference={`${ms.reference} · version ${ms.version}`}
      meta={[
        { label: 'Client / organisation', value: (org.data?.name as string | undefined) ?? '—' },
        { label: 'Site', value: sites.find(x => x.id === ms.site_id)?.name ?? '—' },
        { label: 'Project', value: ms.project_name ?? '—' },
        { label: 'Work dates', value: `${fmtDate(ms.start_date)} – ${fmtDate(ms.end_date)}` },
        { label: 'Status', value: DOC_STATUS_LABELS[status] },
        { label: 'Version', value: ms.version },
        { label: 'Approval', value: approved },
        { label: 'Review date', value: fmtDate(ms.review_date) },
      ]}>
      <PrintSection title="Work scope">
        {text([ms.scope_of_work, s.scope, s.purpose, ms.description].filter(Boolean).join('\n\n') || null)}
        {s.location && <p className="text-sm whitespace-pre-wrap"><strong>Location:</strong> {s.location}</p>}
      </PrintSection>

      <PrintSection title="Method sequence, hazards and controls">
        {stepRows.length === 0 ? text(null) : (
          <table className="table text-sm">
            <thead><tr><th>#</th><th>Step</th><th>Hazards</th><th>Controls</th><th>Responsible</th></tr></thead>
            <tbody>
              {stepRows.map((r, i) => (
                <tr key={r.id} style={{ verticalAlign: 'top' }}>
                  <td>{i + 1}</td>
                  <td><strong>{r.title}</strong>{r.description && <div className="whitespace-pre-wrap">{r.description}</div>}</td>
                  <td className="whitespace-pre-wrap">{r.hazards ?? '—'}</td>
                  <td className="whitespace-pre-wrap">{r.controls ?? '—'}</td>
                  <td>{r.responsible_role ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.work_sequence && <p className="text-sm whitespace-pre-wrap">{s.work_sequence}</p>}
        {(ras.data ?? []).length > 0 && (
          <p className="text-sm">Risk assessments: {(ras.data ?? []).map(r => `${r.reference} v${r.version} ${r.title} (${DOC_STATUS_LABELS[r.status as DocStatus]})`).join('; ')}</p>
        )}
      </PrintSection>

      <PrintSection title="PPE">{text(s.ppe)}</PrintSection>
      <PrintSection title="Plant and equipment">{text(s.plant_equipment)}</PrintSection>

      <PrintSection title="COSHH assessments">
        {(coshh.data ?? []).length === 0 ? text(null) : (
          <ul className="text-sm list-disc pl-5">
            {(coshh.data ?? []).map(c => (
              <li key={c.id as string}>{c.reference as string} v{c.version as number} — {c.title as string}
                {subName.get(c.substance_id as string) ? ` (${subName.get(c.substance_id as string)})` : ''} · {DOC_STATUS_LABELS[c.status as DocStatus]}</li>
            ))}
          </ul>
        )}
      </PrintSection>

      <PrintSection title="Emergency arrangements">{text(s.emergency_arrangements)}</PrintSection>

      <PrintSection title="Responsible persons">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Author</dt><dd>{nameOf(dir, ms.author_id)}</dd></div>
          <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Responsible manager</dt><dd>{nameOf(dir, ms.responsible_manager_id)}</dd></div>
        </dl>
        {s.responsibilities && <p className="text-sm whitespace-pre-wrap">{s.responsibilities}</p>}
        {s.supervision && <p className="text-sm whitespace-pre-wrap"><strong>Supervision:</strong> {s.supervision}</p>}
        {roles.length > 0 && <p className="text-sm"><strong>Roles named in the work sequence:</strong> {roles.join(', ')}</p>}
      </PrintSection>

      <PrintSection title="Approval">
        <p className="text-sm">{approved}. Version {ms.version}.</p>
      </PrintSection>
    </PrintShell>
  );
}
