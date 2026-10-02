import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Copy, Info, Printer } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime, todayIso } from '@/lib/hs/safetyContext';
import {
  DOC_EDITABLE_STATUSES, DOC_LIVE_STATUSES, DOC_STATUS_LABELS, REVIEW_REASON_LABELS, docPath, hazardPath, incidentPath, humanise,
  type DocStatus,
} from '@/lib/hs/safetyVocab';
import { ACTION_STATUS_LABELS } from '@/lib/ui/statusMaps';
import { readAllPages } from '@/lib/supabase/paged';
import Pill, { toneFor } from '@/components/safety/Pill';
import EvidencePanel, { type EvidenceFile } from '@/components/safety/EvidencePanel';
import RaiseAction from '@/components/safety/RaiseAction';
import { RA_COLUMNS, type LibraryControl, type MatrixRow, type RaItem, type RaItemControl, type RaRow } from './raTypes';
import RaHeaderEditor from './RaHeaderEditor';
import RaItems from './RaItems';
import RaWorkflow from './RaWorkflow';
import RaLinks from './RaLinks';
import RiskMatrixGrid from './RiskMatrixGrid';

export const metadata: Metadata = { title: 'Risk assessment' };
export const dynamic = 'force-dynamic';

export default async function RiskAssessmentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: raData } = await supabase.from('risk_assessments').select(RA_COLUMNS).eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!raData) notFound();
  const ra = raData as unknown as RaRow;

  const [dir, { sites, departments }, types, matrix, items, versions, library, hazards, incidents, files, links, linkedIncidents, actions, tplUpdate, copiedFrom, template] = await Promise.all([
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('assessment_types').select('id, name').eq('active', true).order('sort_order').limit(200),
    supabase.from('risk_matrices').select('id, name, company_id, is_default, likelihood_labels, severity_labels, bands').eq('id', ra.risk_matrix_id).maybeSingle(),
    supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id, hazard_description, persons_at_risk, persons_at_risk_notes, existing_controls, likelihood_before, severity_before, initial_risk_score, further_controls_required, likelihood_after, severity_after, residual_risk_score, owner_id, due_date, status, sort_order')
      .eq('risk_assessment_id', id).order('sort_order').order('created_at').limit(200),
    supabase.from('risk_assessments').select('id, version, status, approved_by, approved_at, created_at, superseded_at')
      .eq('company_id', companyId).eq('reference', ra.reference).order('version', { ascending: false }).limit(100),
    supabase.from('controls').select('id, title, control_type, status, verification_required, safety_critical').eq('company_id', companyId).eq('status', 'active').order('title').limit(500),
    supabase.from('hazards').select('id, reference, title').eq('company_id', companyId).neq('status', 'archived').order('identified_at', { ascending: false }).limit(500),
    supabase.from('hs_incidents').select('id, incident_number, title, incident_type').eq('company_id', companyId).order('occurred_on', { ascending: false }).limit(200),
    supabase.from('hs_files').select('id, storage_path, file_name, evidence_type, description').eq('entity_type', 'risk_assessment').eq('entity_id', id).order('created_at').limit(200),
    supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id, relation').or(`and(from_type.eq.risk_assessment,from_id.eq.${id}),and(to_type.eq.risk_assessment,to_id.eq.${id})`).limit(200),
    supabase.from('hs_incidents').select('id, incident_number, title, incident_type').eq('linked_risk_assessment_id', id).limit(200),
    supabase.from('actions').select('id, title, status, due_date, assigned_to').eq('source_type', 'risk_assessment').eq('source_id', id).order('created_at').limit(200),
    ra.template_id && ra.template_version != null
      ? supabase.rpc('hs_template_update_available', { p_template: ra.template_id, p_version: ra.template_version })
      : Promise.resolve({ data: false }),
    ra.copied_from_id
      ? supabase.from('risk_assessments').select('id, reference, version, title').eq('id', ra.copied_from_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ra.template_id
      ? supabase.from('hs_templates').select('id, title, version').eq('id', ra.template_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const m = matrix.data as MatrixRow | null;
  if (!m) notFound();
  const itemRows = (items.data ?? []) as RaItem[];
  const itemIds = itemRows.map(i => i.id);
  const itemControls = itemIds.length
    ? (await readAllPages<RaItemControl>((from, to) => supabase.from('risk_item_controls')
        .select('id, risk_assessment_item_id, control_id, stage, control_title, control_type, effectiveness, effectiveness_recorded_by, effectiveness_recorded_at, notes')
        .in('risk_assessment_item_id', itemIds).order('id').range(from, to))).rows
    : [];

  const status = ra.status;
  const editable = (DOC_EDITABLE_STATUSES as readonly string[]).includes(status) && ctx.can('risk.create');
  const reviewing = status === 'pending_review' && ctx.can('risk.approve');
  const live = (DOC_LIVE_STATUSES as readonly string[]).includes(status);
  const today = todayIso();
  const overdue = live && !!ra.review_date && ra.review_date < today;
  const vs = (versions.data ?? []) as { id: string; version: number; status: DocStatus; approved_by: string | null; approved_at: string | null; created_at: string; superseded_at: string | null }[];
  const newer = vs.find(v => v.version > ra.version);
  const openDraft = vs.find(v => (DOC_EDITABLE_STATUSES as readonly string[]).includes(v.status) || v.status === 'pending_review');
  const siteName = sites.find(s => s.id === ra.site_id)?.name;
  const typeName = (types.data ?? []).find(t => t.id === ra.assessment_type_id)?.name as string | undefined;
  const cf = copiedFrom.data as { id: string; reference: string; version: number; title: string } | null;
  const tpl = template.data as { id: string; title: string; version: number } | null;

  // Linked records: hs_links in either direction, hazards named on risk
  // items, and incidents that point at this assessment.
  const linkRows = (links.data ?? []) as { id: string; from_type: string; from_id: string; to_type: string; to_id: string; relation: string }[];
  const other = (l: typeof linkRows[number]) => (l.from_type === 'risk_assessment' && l.from_id === id ? { type: l.to_type, id: l.to_id } : { type: l.from_type, id: l.from_id });
  const hazardList = (hazards.data ?? []) as { id: string; reference: string; title: string }[];
  const incidentList = (incidents.data ?? []) as { id: string; incident_number: string | null; title: string | null; incident_type: string }[];

  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href="/protect/risk-assessments" className="text-sm inline-flex items-center gap-1 no-print" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> Risk assessments</Link>

      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{ra.reference} · v{ra.version}</span>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{ra.title}</h1>
          <Pill tone={toneFor(status)}>{DOC_STATUS_LABELS[status]}</Pill>
          {overdue && <Pill tone="bad">Review overdue</Pill>}
          <Link href={`${docPath('risk_assessment', id)}/print`} className="btn-ghost btn-sm ml-auto no-print"><Printer size={14} /> Print view</Link>
        </div>

        {newer && (
          <p className="text-sm flex items-center gap-2" style={{ color: 'var(--gold)' }}><Info size={14} />
            This is not the latest version. <Link href={docPath('risk_assessment', newer.id)}>Open v{newer.version}</Link>
          </p>
        )}
        {cf && (
          <p className="text-sm flex items-center gap-2" style={{ color: 'var(--ink-soft)' }}><Copy size={14} />
            Copied from <Link href={docPath('risk_assessment', cf.id)}>{cf.reference} v{cf.version} — {cf.title}</Link>. The copy has not been independently reviewed: check every hazard, rating and control for where it now applies.
          </p>
        )}
        {tpl && (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Made from the template &ldquo;{tpl.title}&rdquo; (v{ra.template_version}).
            {tplUpdate.data === true && <strong style={{ color: 'var(--gold)' }}> A newer version of this template is available (v{tpl.version}). Nothing here has changed — review it and decide whether this assessment needs a new version.</strong>}
          </p>
        )}
        {ra.review_comments && (status === 'changes_requested' || status === 'draft') && (
          <div className="p-3 rounded" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--red)' }}>Reviewer&apos;s comments</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{ra.review_comments}</p>
          </div>
        )}

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Assessment type" value={typeName ?? '—'} />
          <Meta label="Site" value={siteName ?? 'Not site-specific'} />
          <Meta label="Department / area" value={departments.find(d => d.id === ra.department_id)?.name ?? '—'} />
          <Meta label="Risk matrix" value={m.name} />
          <Meta label="Assessor" value={ra.assessor_id ? nameOf(dir, ra.assessor_id) : 'Not named'} />
          <Meta label="Responsible manager" value={ra.responsible_manager_id ? nameOf(dir, ra.responsible_manager_id) : 'Not named'} />
          <Meta label="Assessment date" value={fmtDate(ra.assessment_date)} />
          <Meta label="Review date" value={<span style={overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{fmtDate(ra.review_date)}</span>} />
        </dl>
        {ra.activity_or_process && <Block title="Activity or process">{ra.activity_or_process}</Block>}
        {ra.description && <Block title="Scope and description">{ra.description}</Block>}

        <div className="pt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-soft)' }}>
          <span>Created by {nameOf(dir, ra.created_by)} · {fmtDateTime(ra.created_at)}</span>
          {ra.submitted_at && <span>Submitted by {nameOf(dir, ra.submitted_by)} · {fmtDateTime(ra.submitted_at)}</span>}
          {ra.approved_at && <span><strong>Approved by {nameOf(dir, ra.approved_by)}</strong> · {fmtDateTime(ra.approved_at)}</span>}
          {ra.activated_at && <span>Active from {fmtDateTime(ra.activated_at)}</span>}
          {ra.review_requested_at && <span>Review requested by {nameOf(dir, ra.review_requested_by)} · {fmtDateTime(ra.review_requested_at)}{ra.review_reason ? ` — ${REVIEW_REASON_LABELS[ra.review_reason] ?? humanise(ra.review_reason)}` : ''}</span>}
          {ra.last_reviewed_at && <span>Last reviewed by {nameOf(dir, ra.last_reviewed_by)} · {fmtDateTime(ra.last_reviewed_at)}</span>}
          {ra.superseded_at && <span>Superseded {fmtDateTime(ra.superseded_at)}{ra.superseded_by_id ? <> by <Link href={docPath('risk_assessment', ra.superseded_by_id)}>a newer version</Link></> : null}</span>}
          {ra.archived_at && <span>Archived {fmtDateTime(ra.archived_at)}</span>}
        </div>
      </section>

      <RaWorkflow
        ra={{ id: ra.id, status, row_version: ra.row_version, review_date: ra.review_date, assessor_id: ra.assessor_id,
          created_by: ra.created_by, submitted_by: ra.submitted_by, site_id: ra.site_id, title: ra.title }}
        userId={ctx.userId}
        caps={{ create: ctx.can('risk.create'), approve: ctx.can('risk.approve') }}
        readiness={{ items: itemRows.length, unrated: itemRows.filter(i => i.likelihood_after == null).length }}
        canNewVersion={live && !newer && !openDraft && ctx.can('risk.create')}
        openDraftId={openDraft && openDraft.id !== ra.id ? openDraft.id : null}
        sites={sites}
      />

      {editable && (
        <RaHeaderEditor ra={ra} types={(types.data ?? []) as { id: string; name: string }[]} sites={sites} departments={departments} people={dir} />
      )}

      <RaItems
        raId={ra.id} companyId={companyId} matrix={m} items={itemRows} controls={itemControls} library={(library.data ?? []) as LibraryControl[]}
        hazards={hazardList} people={dir}
        editable={editable} reviewing={reviewing}
      />

      {itemRows.length > 0 && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Risk matrix — initial and residual</h2>
          <RiskMatrixGrid matrix={m} items={itemRows.map((i, n) => ({ n: n + 1, lb: i.likelihood_before, sb: i.severity_before, la: i.likelihood_after, sa: i.severity_after }))} />
        </section>
      )}

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Version history</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Version</th><th>Status</th><th>Created</th><th>Approved</th></tr></thead>
            <tbody>
              {vs.map(v => (
                <tr key={v.id} style={v.id === ra.id ? { background: 'var(--surface-soft)' } : undefined}>
                  <td>{v.id === ra.id ? <strong>v{v.version} (this)</strong> : <Link href={docPath('risk_assessment', v.id)}>v{v.version}</Link>}</td>
                  <td><Pill tone={toneFor(v.status)}>{DOC_STATUS_LABELS[v.status]}</Pill></td>
                  <td>{fmtDate(v.created_at)}</td>
                  <td>{v.approved_at ? `${fmtDate(v.approved_at)} · ${nameOf(dir, v.approved_by)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <RaLinks
        raId={ra.id} companyId={companyId} canEdit={ctx.can('risk.create')}
        links={linkRows.filter(l => ['hazard', 'incident'].includes(other(l).type)).map(l => {
          const o = other(l);
          const h = o.type === 'hazard' ? hazardList.find(x => x.id === o.id) : null;
          const inc = o.type === 'incident' ? incidentList.find(x => x.id === o.id) : null;
          return { id: l.id, type: o.type, targetId: o.id, relation: l.relation,
            label: h ? `${h.reference} — ${h.title}` : inc ? `${inc.incident_number ?? 'Incident'}${inc.title ? ` — ${inc.title}` : ''}` : 'A record you cannot see',
            href: o.type === 'hazard' ? hazardPath(o.id) : incidentPath(o.id) };
        })}
        itemHazards={itemRows.filter(i => i.hazard_id).map(i => {
          const h = hazardList.find(x => x.id === i.hazard_id);
          return { id: i.hazard_id as string, label: h ? `${h.reference} — ${h.title}` : i.hazard_description };
        })}
        incidentsPointingHere={((linkedIncidents.data ?? []) as { id: string; incident_number: string | null; title: string | null; incident_type: string }[])
          .map(i => ({ id: i.id, label: `${i.incident_number ?? 'Incident'} · ${humanise(i.incident_type)}${i.title ? ` — ${i.title}` : ''}` }))}
        hazardOptions={hazardList.map(h => ({ id: h.id, label: `${h.reference} — ${h.title}` }))}
        incidentOptions={incidentList.map(i => ({ id: i.id, label: `${i.incident_number ?? 'Incident'} · ${humanise(i.incident_type)}${i.title ? ` — ${i.title}` : ''}` }))}
      />

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Evidence</h2>
        <EvidencePanel companyId={companyId} entityType="risk_assessment" entityId={ra.id} files={(files.data ?? []) as EvidenceFile[]}
          canUpload={ctx.can('risk.create')} />
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Actions</h2>
        {(actions.data ?? []).length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No actions raised from this assessment. Raise one for each further control that needs doing.</p> : (
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
        {ctx.can('actions.assign') && (
          <RaiseAction companyId={companyId} sourceType="risk_assessment" sourceId={ra.id} siteId={ra.site_id} people={dir}
            defaultClass="preventive" defaultTitle={`${ra.reference}: `} />
        )}
      </section>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</dt><dd style={{ color: 'var(--ink)' }}>{value}</dd></div>;
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>{title}</h3><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{children}</p></div>;
}
