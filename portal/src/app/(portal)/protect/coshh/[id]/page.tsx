import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime, todayIso } from '@/lib/hs/safetyContext';
import {
  DOC_EDITABLE_STATUSES, DOC_STATUS_LABELS, EXPOSURE_ROUTE_LABELS, GHS_PICTOGRAM_LABELS, PERSONS_AT_RISK_LABELS, REVIEW_REASON_LABELS,
  docPath, humanise, incidentPath, type DocStatus, type GhsPictogram, type PersonsAtRisk,
} from '@/lib/hs/safetyVocab';
import { ACTION_STATUS_LABELS } from '@/lib/ui/statusMaps';
import Pill, { toneFor } from '@/components/safety/Pill';
import EvidencePanel, { type EvidenceFile } from '@/components/safety/EvidencePanel';
import RaiseAction from '@/components/safety/RaiseAction';
import RamsCoshhWorkflow from '@/components/safety/RamsCoshhWorkflow';
import { DocStamps, Meta, Notice, Prose, VersionHistory, type VersionRow } from '@/components/safety/RamsCoshhDocMeta';
import CoshhEditor from './CoshhEditor';
import CoshhControls, { type CoshhControlRow, type LibraryControl } from './CoshhControls';

export const metadata: Metadata = { title: 'COSHH assessment' };
export const dynamic = 'force-dynamic';

const empty = { data: [] as Record<string, unknown>[] };

export default async function CoshhDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: c } = await supabase.from('coshh_assessments')
    .select('id, reference, version, copied_from_id, template_id, template_version, site_id, department_id, substance_id, title, task_or_process, exposure_routes, persons_exposed, persons_exposed_notes, frequency, duration, quantity, existing_controls, ppe, first_aid, spill_response, disposal, health_surveillance_required, exposure_monitoring_required, emergency_arrangements, assessor_id, responsible_manager_id, status, assessment_date, review_date, submitted_at, submitted_by, review_comments, approved_by, approved_at, activated_at, superseded_at, archived_at, review_reason, review_requested_at, review_requested_by, last_reviewed_at, last_reviewed_by, row_version, created_by, created_at')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!c) notFound();
  const status = c.status as DocStatus;
  const editable = (DOC_EDITABLE_STATUSES as readonly string[]).includes(status) && ctx.can('risk.create');
  const canRate = editable || (status === 'pending_review' && ctx.can('risk.approve'));

  const [dir, { sites, departments }, sub, controls, library, versions, links, files, actions, tplUpdate, copiedFrom] = await Promise.all([
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('substances').select('id, reference, product_name, manufacturer, supplier, product_code, substance_type, sds_version, sds_date, hazard_statements, pictograms, pictograms_confirmed_at, storage_requirements, active_status').eq('id', c.substance_id).maybeSingle(),
    supabase.from('coshh_assessment_controls').select('id, control_id, control_title, control_type, control_category, effectiveness, effectiveness_recorded_at, notes').eq('coshh_assessment_id', id).limit(500),
    editable ? supabase.from('controls').select('id, title, control_type, category').eq('company_id', companyId).eq('status', 'active').order('title').limit(500) : Promise.resolve(empty),
    supabase.from('coshh_assessments').select('id, version, status, created_at, approved_at').eq('company_id', companyId).eq('reference', c.reference).order('version', { ascending: false }).limit(200),
    supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id').or(`and(from_type.eq.coshh_assessment,from_id.eq.${id}),and(to_type.eq.coshh_assessment,to_id.eq.${id})`).limit(500),
    supabase.from('hs_files').select('id, storage_path, file_name, evidence_type, description').eq('entity_type', 'coshh_assessment').eq('entity_id', id).order('created_at').limit(200),
    supabase.from('actions').select('id, title, status, due_date, assigned_to').eq('source_type', 'coshh_assessment').eq('source_id', id).order('created_at').limit(200),
    c.template_id ? supabase.rpc('hs_template_update_available', { p_template: c.template_id, p_version: c.template_version ?? 0 }) : Promise.resolve({ data: false }),
    c.copied_from_id ? supabase.from('coshh_assessments').select('id, reference, version, title').eq('id', c.copied_from_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const other = ((links.data ?? []) as { id: string; from_type: string; from_id: string; to_type: string; to_id: string }[])
    .map(l => (l.from_type === 'coshh_assessment' && l.from_id === id ? { type: l.to_type, id: l.to_id } : { type: l.from_type, id: l.from_id }));
  const ids = (t: string) => other.filter(o => o.type === t).map(o => o.id);
  const [rams, incs] = await Promise.all([
    ids('method_statement').length ? supabase.from('method_statements').select('id, reference, version, title, status').in('id', ids('method_statement')).limit(500) : Promise.resolve(empty),
    ids('incident').length ? supabase.from('hs_incidents').select('id, incident_number').in('id', ids('incident')).limit(500) : Promise.resolve(empty),
  ]);

  const s = sub.data as { id: string; reference: string; product_name: string; manufacturer: string | null; supplier: string | null; product_code: string | null;
    substance_type: string | null; sds_version: string | null; sds_date: string | null; hazard_statements: string[]; pictograms: GhsPictogram[];
    pictograms_confirmed_at: string | null; storage_requirements: string | null; active_status: string } | null;
  const controlRows = ((controls.data ?? []) as (Omit<CoshhControlRow, 'effectiveness_at'> & { effectiveness_recorded_at: string | null })[])
    .map(r => ({ ...r, effectiveness_at: r.effectiveness_recorded_at }));
  const versionRows = (versions.data ?? []) as VersionRow[];
  const isLatest = versionRows.every(v => v.version <= (c.version as number));
  const today = todayIso();
  const live = status === 'approved' || status === 'active' || status === 'review_due';
  const cf = copiedFrom.data as { id: string; reference: string; version: number; title: string } | null;
  const routes = (c.exposure_routes ?? []) as (keyof typeof EXPOSURE_ROUTE_LABELS)[];
  const persons = (c.persons_exposed ?? []) as PersonsAtRisk[];

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/protect/coshh" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> COSHH register</Link>
        <Link href={`${docPath('coshh_assessment', id)}/print`} className="btn-ghost btn-sm ml-auto"><Printer size={14} /> Print view</Link>
      </div>

      {status === 'review_due' && (
        <Notice tone="bad">
          <strong>Review due{c.review_reason ? `: ${REVIEW_REASON_LABELS[c.review_reason as string] ?? humanise(c.review_reason)}` : ''}.</strong>{' '}
          {c.review_reason === 'sds_change'
            ? <>A new safety data sheet was added for {s ? <Link href={`/protect/substances/${s.id}`}>{s.product_name}</Link> : 'this substance'}
                {c.review_requested_at ? ` on ${fmtDate(c.review_requested_at)}` : ''}{s?.sds_version ? ` (now ${s.sds_version}, issued ${fmtDate(s.sds_date)})` : ''}.
                Check this assessment against the new SDS — the hazards, first aid, spill and disposal information may have changed. Nothing has been changed automatically.</>
            : <>Flagged {fmtDate(c.review_requested_at)} by {nameOf(dir, c.review_requested_by)}. Review the assessment and confirm it with a new review date, or start a new version.</>}
        </Notice>
      )}

      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{c.reference} v{c.version}</span>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{c.title}</h1>
          <Pill tone={toneFor(status)}>{DOC_STATUS_LABELS[status]}</Pill>
          {live && c.review_date && c.review_date < today && <Pill tone="bad">Review overdue</Pill>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="Substance" value={s ? <Link href={`/protect/substances/${s.id}`}>{s.product_name} ({s.reference})</Link> : '—'} />
          <Meta label="Site" value={sites.find(x => x.id === c.site_id)?.name ?? '—'} />
          <Meta label="Department / area" value={departments.find(d => d.id === c.department_id)?.name ?? '—'} />
          <Meta label="Assessor" value={nameOf(dir, c.assessor_id)} />
          <Meta label="Responsible manager" value={nameOf(dir, c.responsible_manager_id)} />
          <Meta label="Assessment date" value={fmtDate(c.assessment_date)} />
          <Meta label="Review date" value={fmtDate(c.review_date)} />
          <Meta label="Last reviewed" value={c.last_reviewed_at ? `${fmtDate(c.last_reviewed_at)} by ${nameOf(dir, c.last_reviewed_by)}` : '—'} />
          <Meta label="Created" value={`${fmtDateTime(c.created_at)} by ${nameOf(dir, c.created_by)}`} />
        </dl>
        {cf && (
          <p className="text-sm" style={{ color: 'var(--gold)' }}>
            Copied from <Link href={docPath('coshh_assessment', cf.id)}>{cf.reference} v{cf.version} — {cf.title}</Link>. The copy has not been independently reviewed.
          </p>
        )}
        {c.template_id && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Started from a template (version {c.template_version}).</p>}
      </section>

      {s && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Substance information</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Manufacturer / supplier" value={[s.manufacturer, s.supplier].filter(Boolean).join(' / ') || '—'} />
            <Meta label="Type" value={s.substance_type ? humanise(s.substance_type) : '—'} />
            <Meta label="Current SDS" value={s.sds_version ? `${s.sds_version} · issued ${fmtDate(s.sds_date)}` : 'No SDS on file'} />
            <Meta label="Register status" value={humanise(s.active_status)} />
          </dl>
          <div className="flex flex-wrap gap-1">
            {s.pictograms.length === 0
              ? <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>No pictograms recorded.</span>
              : s.pictograms.map(p => <Pill key={p} tone="warn">{p} {GHS_PICTOGRAM_LABELS[p]}</Pill>)}
          </div>
          {s.hazard_statements.length > 0 && (
            <ul className="text-sm list-disc pl-5" style={{ color: 'var(--ink-soft)' }}>{s.hazard_statements.map((h, i) => <li key={i}>{h}</li>)}</ul>
          )}
        </section>
      )}

      {tplUpdate.data === true && (
        <Notice tone="info">A newer version of the template this assessment was made from is available. Nothing here has changed — review the template and, if it matters, start a new version.</Notice>
      )}
      {status === 'changes_requested' && c.review_comments && (
        <Notice tone="bad"><strong>Changes requested:</strong> <span className="whitespace-pre-wrap">{c.review_comments}</span></Notice>
      )}

      <RamsCoshhWorkflow kind="coshh_assessment" sites={sites} isLatest={isLatest}
        canCreate={ctx.can('risk.create')} canApprove={ctx.can('risk.approve')}
        doc={{ id, status, row_version: c.row_version, review_date: c.review_date, title: c.title, site_id: c.site_id }} />

      {editable ? (
        <CoshhEditor people={dir} sites={sites} departments={departments} doc={{
          id, row_version: c.row_version, title: c.title, site_id: c.site_id, department_id: c.department_id,
          task_or_process: c.task_or_process, exposure_routes: c.exposure_routes ?? [], persons_exposed: c.persons_exposed ?? [],
          persons_exposed_notes: c.persons_exposed_notes, frequency: c.frequency, duration: c.duration, quantity: c.quantity,
          existing_controls: c.existing_controls, ppe: c.ppe, first_aid: c.first_aid, spill_response: c.spill_response, disposal: c.disposal,
          health_surveillance_required: c.health_surveillance_required, exposure_monitoring_required: c.exposure_monitoring_required,
          emergency_arrangements: c.emergency_arrangements, assessor_id: c.assessor_id, responsible_manager_id: c.responsible_manager_id,
          assessment_date: c.assessment_date, review_date: c.review_date,
        }} />
      ) : (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Assessment</h2>
          {c.task_or_process && <Prose title="Task or process">{c.task_or_process}</Prose>}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Meta label="Exposure routes" value={routes.length ? routes.map(r => EXPOSURE_ROUTE_LABELS[r]).join(', ') : '—'} />
            <Meta label="Persons exposed" value={persons.length ? persons.map(p => PERSONS_AT_RISK_LABELS[p]).join(', ') : '—'} />
            <Meta label="Frequency / duration" value={[c.frequency, c.duration].filter(Boolean).join(' · ') || '—'} />
            <Meta label="Quantity" value={c.quantity ?? '—'} />
            <Meta label="Health surveillance" value={c.health_surveillance_required ? 'Required' : 'Not required'} />
            <Meta label="Exposure monitoring" value={c.exposure_monitoring_required ? 'Required' : 'Not required'} />
          </dl>
          {c.persons_exposed_notes && <Prose title="Who is exposed — notes">{c.persons_exposed_notes}</Prose>}
          {c.existing_controls && <Prose title="Existing controls">{c.existing_controls}</Prose>}
          {c.ppe && <Prose title="PPE / RPE">{c.ppe}</Prose>}
          {c.first_aid && <Prose title="First aid">{c.first_aid}</Prose>}
          {c.spill_response && <Prose title="Spill response">{c.spill_response}</Prose>}
          {c.disposal && <Prose title="Disposal">{c.disposal}</Prose>}
          {c.emergency_arrangements && <Prose title="Emergency arrangements">{c.emergency_arrangements}</Prose>}
        </section>
      )}

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Controls</h2>
        <CoshhControls coshhId={id} companyId={companyId} rows={controlRows} library={(library.data ?? []) as LibraryControl[]}
          canLink={editable} canRate={canRate} />
      </section>

      {((rams.data ?? []).length > 0 || (incs.data ?? []).length > 0) && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Linked records</h2>
          <ul className="text-sm space-y-1">
            {(rams.data ?? []).map(r => (
              <li key={r.id as string}>RAMS <Link href={docPath('method_statement', r.id as string)}>{r.reference as string} v{r.version as number} — {r.title as string}</Link>{' '}
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>· {DOC_STATUS_LABELS[r.status as DocStatus]}</span></li>
            ))}
            {(incs.data ?? []).map(i => <li key={i.id as string}>Incident <Link href={incidentPath(i.id as string)}>{i.incident_number as string}</Link></li>)}
          </ul>
        </section>
      )}

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Approval</h2>
        <DocStamps stamps={[
          { label: 'Submitted', who: nameOf(dir, c.submitted_by), when: c.submitted_at },
          { label: 'Approved', who: nameOf(dir, c.approved_by), when: c.approved_at },
          { label: 'Made active', who: null, when: c.activated_at },
          { label: 'Review requested', who: nameOf(dir, c.review_requested_by), when: c.review_requested_at },
          { label: 'Last reviewed', who: nameOf(dir, c.last_reviewed_by), when: c.last_reviewed_at },
          { label: 'Superseded', who: null, when: c.superseded_at },
          { label: 'Archived', who: null, when: c.archived_at },
        ]} />
        <h3 className="text-sm font-semibold pt-2" style={{ color: 'var(--ink-soft)' }}>Version history</h3>
        <VersionHistory versions={versionRows} currentId={id} hrefFor={v => docPath('coshh_assessment', v)} />
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Evidence</h2>
        <EvidencePanel companyId={companyId} entityType="coshh_assessment" entityId={id} files={(files.data ?? []) as EvidenceFile[]} canUpload={ctx.can('risk.create')} />
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Actions</h2>
        {(actions.data ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No actions raised from this assessment.</p> : (
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
        {ctx.can('actions.assign') && <RaiseAction companyId={companyId} sourceType="coshh_assessment" sourceId={id} siteId={c.site_id} people={dir}
          defaultTitle={`COSHH ${c.reference}: `.slice(0, 200)} />}
      </section>
    </main>
  );
}
