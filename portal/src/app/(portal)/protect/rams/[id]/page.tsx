import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime, todayIso } from '@/lib/hs/safetyContext';
import {
  DOC_EDITABLE_STATUSES, DOC_STATUS_LABELS, RAMS_ACK_METHOD_LABELS, RAMS_SECTION_KEYS, RAMS_SECTION_LABELS, docPath, incidentPath,
  type DocStatus, type RamsSectionKey,
} from '@/lib/hs/safetyVocab';
import { ACTION_STATUS_LABELS } from '@/lib/ui/statusMaps';
import Pill, { toneFor } from '@/components/safety/Pill';
import EvidencePanel, { type EvidenceFile } from '@/components/safety/EvidencePanel';
import RaiseAction from '@/components/safety/RaiseAction';
import RamsCoshhWorkflow from '@/components/safety/RamsCoshhWorkflow';
import RamsCoshhLinks, { type LinkedRecord, type LinkOption } from '@/components/safety/RamsCoshhLinks';
import { DocStamps, Meta, Notice, Prose, VersionHistory, type VersionRow } from '@/components/safety/RamsCoshhDocMeta';
import RamsHeaderEditor from './RamsHeaderEditor';
import RamsSteps, { type Step } from './RamsSteps';
import RamsAcknowledge from './RamsAcknowledge';

export const metadata: Metadata = { title: 'RAMS' };
export const dynamic = 'force-dynamic';

const LINK_TYPES: Record<string, string> = { risk_assessment: 'Risk assessment', coshh_assessment: 'COSHH assessment' };
const empty = { data: [] as Record<string, unknown>[] };

export default async function RamsDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: ms } = await supabase.from('method_statements')
    .select('id, company_id, reference, version, previous_version_id, copied_from_id, template_id, template_version, site_id, department_id, project_name, title, description, scope_of_work, sections, author_id, responsible_manager_id, status, start_date, end_date, review_date, submitted_at, submitted_by, review_comments, approved_by, approved_at, activated_at, superseded_at, archived_at, row_version, created_by, created_at')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!ms) notFound();
  const status = ms.status as DocStatus;
  const editable = (DOC_EDITABLE_STATUSES as readonly string[]).includes(status) && ctx.can('risk.create');
  const ackOpen = status === 'approved' || status === 'active';

  const [dir, { sites, departments }, steps, versions, links, acks, files, actions, raOpts, coshhOpts, people, tplUpdate, copiedFrom] = await Promise.all([
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('method_statement_steps').select('id, sequence_number, title, description, hazards, controls, responsible_role').eq('method_statement_id', id).order('sequence_number').limit(500),
    supabase.from('method_statements').select('id, version, status, created_at, approved_at').eq('company_id', companyId).eq('reference', ms.reference).order('version', { ascending: false }).limit(200),
    supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id').or(`and(from_type.eq.method_statement,from_id.eq.${id}),and(to_type.eq.method_statement,to_id.eq.${id})`).limit(500),
    supabase.from('rams_acknowledgements').select('id, method_statement_version, person_id, acknowledged_at, confirmation, method, session_ref, recorded_by').eq('method_statement_id', id).order('acknowledged_at', { ascending: false }).limit(500),
    supabase.from('hs_files').select('id, storage_path, file_name, evidence_type, description').eq('entity_type', 'method_statement').eq('entity_id', id).order('created_at').limit(200),
    supabase.from('actions').select('id, title, status, due_date, assigned_to').eq('source_type', 'method_statement').eq('source_id', id).order('created_at').limit(200),
    editable ? supabase.from('risk_assessments').select('id, reference, version, title, status').eq('company_id', companyId).not('status', 'in', '(superseded,archived)').order('reference').limit(500) : Promise.resolve(empty),
    editable ? supabase.from('coshh_assessments').select('id, reference, version, title, status').eq('company_id', companyId).not('status', 'in', '(superseded,archived)').order('reference').limit(500) : Promise.resolve(empty),
    ackOpen && ctx.can('risk.create')
      ? supabase.from('people').select('id, full_name').eq('company_id', companyId).eq('active_status', 'active').order('full_name').limit(500)
      : Promise.resolve(empty),
    ms.template_id ? supabase.rpc('hs_template_update_available', { p_template: ms.template_id, p_version: ms.template_version ?? 0 }) : Promise.resolve({ data: false }),
    ms.copied_from_id ? supabase.from('method_statements').select('id, reference, version, title').eq('id', ms.copied_from_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const stepRows = (steps.data ?? []) as Step[];
  const linkRows = (links.data ?? []) as { id: string; from_type: string; from_id: string; to_type: string; to_id: string }[];
  const other = linkRows.map(l => (l.from_type === 'method_statement' && l.from_id === id
    ? { linkId: l.id, type: l.to_type, id: l.to_id } : { linkId: l.id, type: l.from_type, id: l.from_id }));
  const idsOf = (t: string) => other.filter(o => o.type === t).map(o => o.id);
  const ackRows = (acks.data ?? []) as { id: string; method_statement_version: number; person_id: string; acknowledged_at: string;
    confirmation: string; method: keyof typeof RAMS_ACK_METHOD_LABELS; session_ref: string | null; recorded_by: string | null }[];
  const stepIds = stepRows.map(s => s.id);
  const ackPersonIds = [...new Set(ackRows.map(a => a.person_id))];

  const [ras, coshhs, incs, stepFiles, ackPeople] = await Promise.all([
    idsOf('risk_assessment').length ? supabase.from('risk_assessments').select('id, reference, version, title, status').in('id', idsOf('risk_assessment')).limit(500) : Promise.resolve(empty),
    idsOf('coshh_assessment').length ? supabase.from('coshh_assessments').select('id, reference, version, title, status').in('id', idsOf('coshh_assessment')).limit(500) : Promise.resolve(empty),
    idsOf('incident').length ? supabase.from('hs_incidents').select('id, incident_number, incident_type, status').in('id', idsOf('incident')).limit(500) : Promise.resolve(empty),
    stepIds.length ? supabase.from('hs_files').select('id, entity_id, storage_path, file_name, evidence_type, description').eq('entity_type', 'method_statement_step').in('entity_id', stepIds).order('created_at').limit(500) : Promise.resolve(empty),
    ackPersonIds.length ? supabase.from('people').select('id, full_name').in('id', ackPersonIds).limit(500) : Promise.resolve(empty),
  ]);

  const docLabel = (r: Record<string, unknown>) => `${r.reference as string} v${r.version as number} — ${r.title as string}`;
  const byId = (rows: Record<string, unknown>[]) => new Map(rows.map(r => [r.id as string, r]));
  const raMap = byId(ras.data ?? []); const coshhMap = byId(coshhs.data ?? []); const incMap = byId(incs.data ?? []);
  const docLinks: LinkedRecord[] = other.filter(o => o.type === 'risk_assessment' || o.type === 'coshh_assessment').map(o => {
    const r = (o.type === 'risk_assessment' ? raMap : coshhMap).get(o.id);
    return { linkId: o.linkId, type: o.type, id: o.id,
      label: r ? docLabel(r) : 'A record you cannot see', href: r ? docPath(o.type as 'risk_assessment' | 'coshh_assessment', o.id) : null,
      status: r ? DOC_STATUS_LABELS[r.status as DocStatus] : null };
  });
  const incidentLinks = other.filter(o => o.type === 'incident');
  const options: LinkOption[] = [
    ...(raOpts.data ?? []).map(r => ({ type: 'risk_assessment', id: r.id as string, label: docLabel(r) })),
    ...(coshhOpts.data ?? []).map(r => ({ type: 'coshh_assessment', id: r.id as string, label: docLabel(r) })),
  ];
  const filesByStep: Record<string, EvidenceFile[]> = {};
  for (const f of (stepFiles.data ?? []) as (EvidenceFile & { entity_id: string })[]) (filesByStep[f.entity_id] ??= []).push(f);
  const personName = new Map(((ackPeople.data ?? []) as { id: string; full_name: string }[]).map(p => [p.id, p.full_name]));
  const versionRows = (versions.data ?? []) as VersionRow[];
  const isLatest = versionRows.every(v => v.version <= (ms.version as number));
  const sections = (ms.sections ?? {}) as Partial<Record<RamsSectionKey, string | null>>;
  const today = todayIso();
  const live = status === 'approved' || status === 'active';
  const cf = copiedFrom.data as { id: string; reference: string; version: number; title: string } | null;

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/protect/rams" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> RAMS</Link>
        <Link href={`${docPath('method_statement', id)}/print`} className="btn-ghost btn-sm ml-auto"><Printer size={14} /> Print view</Link>
      </div>

      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{ms.reference} v{ms.version}</span>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{ms.title}</h1>
          <Pill tone={toneFor(status)}>{DOC_STATUS_LABELS[status]}</Pill>
          {live && ms.end_date && ms.end_date < today && <Pill tone="bad">Work end date passed</Pill>}
          {live && ms.review_date && ms.review_date < today && <Pill tone="bad">Review overdue</Pill>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="Project" value={ms.project_name ?? '—'} />
          <Meta label="Site" value={sites.find(s => s.id === ms.site_id)?.name ?? '—'} />
          <Meta label="Department / area" value={departments.find(d => d.id === ms.department_id)?.name ?? '—'} />
          <Meta label="Author" value={nameOf(dir, ms.author_id)} />
          <Meta label="Responsible manager" value={nameOf(dir, ms.responsible_manager_id)} />
          <Meta label="Work dates" value={`${fmtDate(ms.start_date)} – ${fmtDate(ms.end_date)}`} />
          <Meta label="Review date" value={fmtDate(ms.review_date)} />
          <Meta label="Created" value={`${fmtDateTime(ms.created_at)} by ${nameOf(dir, ms.created_by)}`} />
        </dl>
        {cf && (
          <p className="text-sm" style={{ color: 'var(--gold)' }}>
            Copied from <Link href={docPath('method_statement', cf.id)}>{cf.reference} v{cf.version} — {cf.title}</Link>. The copy has not been independently reviewed.
          </p>
        )}
        {ms.template_id && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Started from a template (version {ms.template_version}).</p>}
        {!editable && (
          <>
            {ms.description && <Prose title="Description">{ms.description}</Prose>}
            {ms.scope_of_work && <Prose title="Scope of work">{ms.scope_of_work}</Prose>}
            {RAMS_SECTION_KEYS.filter(k => sections[k]).map(k => <Prose key={k} title={RAMS_SECTION_LABELS[k]}>{sections[k]}</Prose>)}
          </>
        )}
      </section>

      {tplUpdate.data === true && (
        <Notice tone="info">A newer version of the template this RAMS was made from is available. Nothing here has changed — review the template and, if it matters for this work, start a new version.</Notice>
      )}
      {status === 'changes_requested' && ms.review_comments && (
        <Notice tone="bad"><strong>Changes requested:</strong> <span className="whitespace-pre-wrap">{ms.review_comments}</span></Notice>
      )}

      <RamsCoshhWorkflow kind="method_statement" sites={sites} isLatest={isLatest}
        canCreate={ctx.can('risk.create')} canApprove={ctx.can('risk.approve')}
        doc={{ id, status, row_version: ms.row_version, review_date: ms.review_date, title: ms.title, site_id: ms.site_id }} />

      {editable && (
        <RamsHeaderEditor people={dir} sites={sites} departments={departments} ms={{
          id, row_version: ms.row_version, title: ms.title, project_name: ms.project_name, description: ms.description,
          scope_of_work: ms.scope_of_work, site_id: ms.site_id, department_id: ms.department_id, start_date: ms.start_date,
          end_date: ms.end_date, review_date: ms.review_date, author_id: ms.author_id, responsible_manager_id: ms.responsible_manager_id,
          sections,
        }} />
      )}

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Work sequence</h2>
        <RamsSteps msId={id} companyId={companyId} steps={stepRows} editable={editable} files={filesByStep} canUpload={ctx.can('risk.create')} />
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Linked assessments</h2>
        <RamsCoshhLinks fromType="method_statement" fromId={id} linked={docLinks} options={options} typeLabels={LINK_TYPES}
          canEdit={editable} emptyText="No risk assessments or COSHH assessments linked yet." />
        {incidentLinks.length > 0 && (
          <>
            <h3 className="text-sm font-semibold pt-2" style={{ color: 'var(--ink-soft)' }}>Linked incidents</h3>
            <ul className="text-sm space-y-1">
              {incidentLinks.map(l => {
                const inc = incMap.get(l.id);
                return <li key={l.linkId}>{inc ? <Link href={incidentPath(l.id)}>{inc.incident_number as string}</Link> : 'An incident you cannot see'}</li>;
              })}
            </ul>
          </>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Approval</h2>
        <DocStamps stamps={[
          { label: 'Submitted', who: nameOf(dir, ms.submitted_by), when: ms.submitted_at },
          { label: 'Approved', who: nameOf(dir, ms.approved_by), when: ms.approved_at },
          { label: 'Made active', who: null, when: ms.activated_at },
          { label: 'Superseded', who: null, when: ms.superseded_at },
          { label: 'Archived', who: null, when: ms.archived_at },
        ]} />
        <h3 className="text-sm font-semibold pt-2" style={{ color: 'var(--ink-soft)' }}>Version history</h3>
        <VersionHistory versions={versionRows} currentId={id} hrefFor={v => docPath('method_statement', v)} />
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Acknowledgements</h2>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Who has confirmed they have read and understood the method statement, against the approved version they were shown.
        </p>
        {ackRows.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No acknowledgements recorded.</p> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Person</th><th>Version</th><th>When</th><th>How</th><th>Confirmation</th><th>Recorded by</th></tr></thead>
              <tbody>
                {ackRows.map(a => (
                  <tr key={a.id}>
                    <td>{personName.get(a.person_id) ?? '—'}</td>
                    <td>v{a.method_statement_version}{a.method_statement_version !== ms.version && <span className="text-xs" style={{ color: 'var(--gold)' }}> (earlier version)</span>}</td>
                    <td className="whitespace-nowrap">{fmtDateTime(a.acknowledged_at)}</td>
                    <td>{RAMS_ACK_METHOD_LABELS[a.method] ?? a.method}{a.session_ref ? ` · ${a.session_ref}` : ''}</td>
                    <td className="text-xs">{a.confirmation}</td>
                    <td>{nameOf(dir, a.recorded_by)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ackOpen && ctx.can('risk.create')
          ? <RamsAcknowledge msId={id} people={(people.data ?? []) as { id: string; full_name: string }[]} />
          : !ackOpen && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Acknowledgements can be recorded once this version is approved.</p>}
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Evidence and attachments</h2>
        <EvidencePanel companyId={companyId} entityType="method_statement" entityId={id} files={(files.data ?? []) as EvidenceFile[]} canUpload={ctx.can('risk.create')} />
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Actions</h2>
        {(actions.data ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No actions raised from this method statement.</p> : (
          <ul className="text-sm space-y-1">
            {(actions.data ?? []).map(a => (
              <li key={a.id as string} className="flex flex-wrap gap-2 items-center">
                <span style={{ color: 'var(--ink)' }}>{a.title as string}</span>
                <Pill tone={toneFor(a.status as string)}>{ACTION_STATUS_LABELS[a.status as string] ?? String(a.status)}</Pill>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{a.assigned_to ? nameOf(dir, a.assigned_to as string) : 'Unassigned'} · due {fmtDate(a.due_date as string | null)}</span>
              </li>
            ))}
          </ul>
        )}
        {ctx.can('actions.assign') && <RaiseAction companyId={companyId} sourceType="method_statement" sourceId={id} siteId={ms.site_id} people={dir}
          defaultTitle={`RAMS ${ms.reference}: `.slice(0, 200)} />}
      </section>
    </main>
  );
}
