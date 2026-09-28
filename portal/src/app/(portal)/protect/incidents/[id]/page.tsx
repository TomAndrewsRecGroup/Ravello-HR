import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock, Printer } from 'lucide-react';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime } from '@/lib/hs/safetyContext';
import { HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_STATUS_LABELS, HS_INCIDENT_TYPE_LABELS } from '@/lib/hs/vocab';
import {
  ACTION_CLASS_LABELS, INCIDENT_IMMEDIATE_ACTION_LABELS, INCIDENT_PERSON_ROLE_LABELS, RIDDOR_REVIEW_STATUS_LABELS, docPath, hazardPath,
  humanise, type ActionClass, type IncidentImmediateAction, type IncidentPersonRole,
} from '@/lib/hs/safetyVocab';
import { ACTION_STATUS_LABELS } from '@/lib/ui/statusMaps';
import Pill, { toneFor } from '@/components/safety/Pill';
import EvidencePanel, { type EvidenceFile } from '@/components/safety/EvidencePanel';
import RaiseAction from '@/components/safety/RaiseAction';
import IncidentManage from './IncidentManage';
import IncidentPeople from './IncidentPeople';
import InvestigationPanel from './InvestigationPanel';
import RiddorPanel from './RiddorPanel';
import IncidentLinks, { type ResolvedLink } from './IncidentLinks';
import IncidentTraining from './IncidentTraining';
import type {
  ActionRow, CauseRow, IncidentPersonRow, IncidentRow, InvestigationRow, Option, RiddorRow, SensitiveRow, TimelineRow,
  TrainingCheckRow, TrainingEvidenceRow, WhyRow,
} from './types';

export const metadata: Metadata = { title: 'Incident' };
export const dynamic = 'force-dynamic';

const EMPTY = Promise.resolve({ data: [] as Record<string, unknown>[] });
type Row = Record<string, unknown>;
const LINKABLE: Record<string, { label: (r: Row) => string; href: (id: string) => string | null }> = {
  hazard:           { label: r => `${r.reference} — ${r.title}`, href: id => hazardPath(id) },
  risk_assessment:  { label: r => `${r.reference} v${r.version} — ${r.title}`, href: id => docPath('risk_assessment', id) },
  method_statement: { label: r => `${r.reference} v${r.version} — ${r.title}`, href: id => docPath('method_statement', id) },
  coshh_assessment: { label: r => `${r.reference} v${r.version} — ${r.title}`, href: id => docPath('coshh_assessment', id) },
  equipment:        { label: r => `${r.name}${r.serial_number ? ` (${r.serial_number})` : ''}`, href: () => '/protect/equipment' },
};

// The incident workspace (125): what happened, who was involved, the
// evidence, the one investigation, the RIDDOR review and the corrective
// actions. RLS and the 125/126 guards decide every read and write; the
// capability checks here only choose what to show. Injury records and
// witness/medical evidence are not even fetched without
// incident.sensitive.read.
export default async function IncidentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();

  const { data: incData } = await supabase.from('hs_incidents')
    .select('id, company_id, incident_number, incident_type, title, description, occurred_on, incident_time, reported_at, reported_by, person_in_charge_id, site_id, department_id, exact_location, activity_underway, immediate_action, immediate_actions, severity, severity_confirmed_by, severity_confirmed_at, status, investigation_required, riddor_review_status, riddor_reportable, riddor_reported_on, linked_risk_assessment_id, no_assessment_existed, linked_asset_id, linked_contractor_id, triaged_by, triaged_at, closed_by, closed_at, close_override_reason, archived_at, row_version')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!incData) notFound();
  const inc = incData as IncidentRow;

  const canRead = ctx.can('incident.read');
  const canInvestigate = ctx.can('incident.investigate');
  const canApprove = ctx.can('incident.approve');
  const canSensitive = ctx.can('incident.sensitive.read');
  const canRiddor = ctx.can('riddor.review');
  const canAssign = ctx.can('actions.assign');
  const isReporter = inc.reported_by === ctx.userId;
  const open = inc.status !== 'closed' && inc.status !== 'archived';

  const [dir, { sites, departments }, peopleRes, filesRes, invRes, riddorRes, linksRes, blockersRes, orgPeopleRes,
    raRes, ramsRes, coshhRes, hazRes, eqRes, tplRes, actRes] = await Promise.all([
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('incident_people').select('id, person_id, external_name, role_in_incident, employer, created_at').eq('incident_id', id).order('created_at').limit(200),
    supabase.from('hs_files').select('id, storage_path, file_name, evidence_type, description').eq('entity_type', 'incident').eq('entity_id', id).order('created_at').limit(200),
    supabase.from('incident_investigations').select('id, reference, lead_investigator_id, team_member_ids, started_at, target_completion_date, completed_at, summary, sequence_of_events, immediate_causes, underlying_causes, root_causes, contributing_factors, findings, lessons_learned, status, submitted_at, submitted_by, review_comments, approved_by, approved_at, row_version').eq('incident_id', id).maybeSingle(),
    supabase.from('riddor_reviews').select('id, death, specified_injury, over_seven_day_incapacity, dangerous_occurrence, occupational_disease, gas_incident, non_worker_hospital, notes, status, decision, decision_by, decision_at, rationale, reporting_reference, report_date, row_version').eq('incident_id', id).maybeSingle(),
    canRead ? supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id').or(`and(from_type.eq.incident,from_id.eq.${id}),and(to_type.eq.incident,to_id.eq.${id})`).limit(200) : EMPTY,
    canApprove && open ? supabase.rpc('hs_incident_close_blockers', { p_incident: id }) : Promise.resolve({ data: null }),
    supabase.from('people').select('id, full_name').eq('company_id', companyId).eq('active_status', 'active').order('full_name').limit(500),
    canInvestigate ? supabase.from('risk_assessments').select('id, reference, version, title, status').eq('company_id', companyId).order('reference').limit(500) : EMPTY,
    canInvestigate ? supabase.from('method_statements').select('id, reference, version, title, status').eq('company_id', companyId).order('reference').limit(500) : EMPTY,
    canInvestigate ? supabase.from('coshh_assessments').select('id, reference, version, title, status').eq('company_id', companyId).order('reference').limit(500) : EMPTY,
    canInvestigate ? supabase.from('hazards').select('id, reference, title, status').eq('company_id', companyId).order('reference').limit(500) : EMPTY,
    canInvestigate ? supabase.from('hs_equipment').select('id, name, serial_number').eq('company_id', companyId).order('name').limit(500) : EMPTY,
    canInvestigate ? supabase.from('hs_templates').select('content').eq('kind', 'investigation').limit(1) : EMPTY,
    canRead ? supabase.from('actions').select('id, title, status, priority, action_class, due_date, assigned_to, verifier_id, verification_required, verified_at, source_type, completed_at').eq('source_type', 'incident').eq('source_id', id).order('created_at').limit(200) : EMPTY,
  ]);

  const people = (peopleRes.data ?? []) as IncidentPersonRow[];
  const inv = (invRes.data ?? null) as InvestigationRow | null;
  const riddor = (riddorRes.data ?? null) as RiddorRow | null;
  const links = (linksRes.data ?? []) as { id: string; from_type: string; from_id: string; to_type: string; to_id: string }[];
  const blockers = (blockersRes.data ?? null) as string | null;

  // Resolve linked-record labels (per type, by id) and the investigation's working rows.
  const others = links.map(l => (l.from_type === 'incident' && l.from_id === id ? { id: l.id, type: l.to_type, rid: l.to_id } : { id: l.id, type: l.from_type, rid: l.from_id }));
  const byType = new Map<string, string[]>();
  for (const o of others) if (LINKABLE[o.type]) byType.set(o.type, [...(byType.get(o.type) ?? []), o.rid]);
  if (inc.linked_risk_assessment_id) byType.set('risk_assessment', [...(byType.get('risk_assessment') ?? []), inc.linked_risk_assessment_id]);
  if (inc.linked_asset_id) byType.set('equipment', [...(byType.get('equipment') ?? []), inc.linked_asset_id]);
  const ids = (t: string) => byType.get(t) ?? [];

  const onRecordIds = people.filter(p => p.person_id).map(p => p.id);
  const [labelRes, tlRes, causeRes, whyRes, invFilesRes, invActRes, sensRes, eventsRes, trainEvRes, trainChkRes] = await Promise.all([
    Promise.all([
      ids('hazard').length ? supabase.from('hazards').select('id, reference, title').in('id', ids('hazard')).limit(200) : EMPTY,
      ids('risk_assessment').length ? supabase.from('risk_assessments').select('id, reference, version, title').in('id', ids('risk_assessment')).limit(200) : EMPTY,
      ids('method_statement').length ? supabase.from('method_statements').select('id, reference, version, title').in('id', ids('method_statement')).limit(200) : EMPTY,
      ids('coshh_assessment').length ? supabase.from('coshh_assessments').select('id, reference, version, title').in('id', ids('coshh_assessment')).limit(200) : EMPTY,
      ids('equipment').length ? supabase.from('hs_equipment').select('id, name, serial_number').in('id', ids('equipment')).limit(200) : EMPTY,
    ]),
    inv ? supabase.from('incident_timeline_events').select('id, sequence, event_time, title, description, person_id').eq('investigation_id', inv.id).order('sequence').limit(500) : EMPTY,
    inv ? supabase.from('incident_causes').select('id, cause_level, category, description, confirmed_by, confirmed_at').eq('investigation_id', inv.id).order('created_at').limit(200) : EMPTY,
    inv ? supabase.from('investigation_why_analyses').select('id, problem, whys, conclusion, linked_cause_id').eq('investigation_id', inv.id).order('created_at').limit(100) : EMPTY,
    inv ? supabase.from('hs_files').select('id, storage_path, file_name, evidence_type, description').eq('entity_type', 'investigation').eq('entity_id', inv.id).order('created_at').limit(200) : EMPTY,
    inv && canRead ? supabase.from('actions').select('id, title, status, priority, action_class, due_date, assigned_to, verifier_id, verification_required, verified_at, source_type, completed_at').eq('source_type', 'investigation').eq('source_id', inv.id).order('created_at').limit(200) : EMPTY,
    canSensitive && people.length
      ? supabase.from('incident_person_sensitive').select('incident_person_id, contact_phone, contact_email, contact_address, body_parts, injury_types, treatment, first_aid_given, hospital_attendance, time_lost, days_lost, work_restriction, return_date, notes, recorded_by, updated_at').in('incident_person_id', people.map(p => p.id)).limit(200)
      : Promise.resolve({ data: null }),
    canRead ? supabase.from('hs_events').select('id, occurred_at, summary, actor_id').eq('company_id', companyId).in('entity_id', inv ? [id, inv.id] : [id]).order('occurred_at', { ascending: false }).limit(100) : EMPTY,
    // Training evidence: investigators / approvers only, and only for people on the records (130).
    (canInvestigate || canApprove) && onRecordIds.length ? supabase.rpc('incident_training_evidence', { p_incident: id }) : Promise.resolve({ data: null }),
    canRead ? supabase.from('incident_training_checks').select('id, incident_person_id, course_name, completed_on, expires_on, status_at_incident, incident_date, note, checked_by, checked_at, withdrawn_at, withdrawn_by, withdrawn_reason').eq('incident_id', id).order('checked_at').limit(500) : EMPTY,
  ]);

  const labels = new Map<string, string>();
  (['hazard', 'risk_assessment', 'method_statement', 'coshh_assessment', 'equipment'] as const).forEach((t, i) => {
    for (const r of (labelRes[i].data ?? []) as unknown as Row[]) labels.set(`${t}:${r.id}`, LINKABLE[t].label(r));
  });
  const resolved: ResolvedLink[] = others.filter(o => LINKABLE[o.type]).map(o => ({
    id: o.id, type: o.type, label: labels.get(`${o.type}:${o.rid}`) ?? 'A record you cannot see', href: LINKABLE[o.type].href(o.rid),
  }));
  const raLabel = inc.linked_risk_assessment_id ? labels.get(`risk_assessment:${inc.linked_risk_assessment_id}`) ?? 'A risk assessment you cannot see' : null;
  const assetLabel = inc.linked_asset_id ? labels.get(`equipment:${inc.linked_asset_id}`) ?? 'Equipment record' : null;

  const toOpts = (rows: unknown, f: (r: Row) => string): Option[] =>
    ((rows ?? []) as Row[]).filter(r => !['archived', 'superseded'].includes(String(r.status ?? ''))).map(r => ({ id: r.id as string, label: f(r) }));
  const raOpts = toOpts(raRes.data, LINKABLE.risk_assessment.label);
  const linkOptions: Record<string, Option[]> = {
    hazard: toOpts(hazRes.data, LINKABLE.hazard.label), risk_assessment: raOpts,
    method_statement: toOpts(ramsRes.data, LINKABLE.method_statement.label), coshh_assessment: toOpts(coshhRes.data, LINKABLE.coshh_assessment.label),
    equipment: toOpts(eqRes.data, LINKABLE.equipment.label),
  };
  const orgPeople: Option[] = ((orgPeopleRes.data ?? []) as { id: string; full_name: string }[]).map(p => ({ id: p.id, label: p.full_name }));
  const personName = (pid: string | null) => (pid ? orgPeople.find(p => p.id === pid)?.label ?? 'A person on record' : '—');
  const tpl = ((tplRes.data ?? [])[0] as { content?: { prompts?: unknown } } | undefined)?.content?.prompts;
  const prompts = Array.isArray(tpl) ? tpl.filter((p): p is string => typeof p === 'string') : [];
  const actions = [...((actRes.data ?? []) as unknown as ActionRow[]), ...((invActRes.data ?? []) as unknown as ActionRow[])];
  const files = (filesRes.data ?? []) as EvidenceFile[];
  const invFiles = (invFilesRes.data ?? []) as EvidenceFile[];
  const events = (eventsRes.data ?? []) as { id: number; occurred_at: string; summary: string; actor_id: string | null }[];
  const siteName = sites.find(s => s.id === inc.site_id)?.name;
  const deptName = departments.find(d => d.id === inc.department_id)?.name;
  const severity = inc.severity && inc.severity_confirmed_at ? HS_INCIDENT_SEVERITY_LABELS[inc.severity] : null;

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/protect/incidents" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> Incidents</Link>
        <Link href={`/protect/incidents/${inc.id}/print`} className="btn-ghost btn-sm ml-auto"><Printer size={14} /> Incident report</Link>
      </div>

      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{inc.incident_number}</span>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{inc.title ?? HS_INCIDENT_TYPE_LABELS[inc.incident_type]}</h1>
          <Pill tone={toneFor(inc.status)}>{HS_INCIDENT_STATUS_LABELS[inc.status]}</Pill>
          <Pill tone={inc.incident_type === 'near_miss' ? 'info' : 'neutral'}>{HS_INCIDENT_TYPE_LABELS[inc.incident_type]}</Pill>
          {severity
            ? <Pill tone={['major', 'critical', 'fatal'].includes(inc.severity!) ? 'bad' : inc.severity === 'serious' ? 'warn' : 'neutral'}>Severity: {severity}</Pill>
            : <Pill tone="muted">Severity unconfirmed</Pill>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Date / time" value={`${fmtDate(inc.occurred_on)}${inc.incident_time ? ` ${inc.incident_time.slice(0, 5)}` : ''}`} />
          <Meta label="Site" value={siteName ?? '—'} />
          <Meta label="Department / area" value={deptName ?? '—'} />
          <Meta label="Exact location" value={inc.exact_location ?? '—'} />
          <Meta label="Reported by" value={nameOf(dir, inc.reported_by)} />
          <Meta label="Reported" value={fmtDateTime(inc.reported_at)} />
          <Meta label="Person in charge" value={personName(inc.person_in_charge_id)} />
          <Meta label="Severity confirmed" value={inc.severity_confirmed_at ? `${nameOf(dir, inc.severity_confirmed_by)}, ${fmtDateTime(inc.severity_confirmed_at)}` : 'Not yet'} />
          <Meta label="Triaged" value={inc.triaged_at ? `${nameOf(dir, inc.triaged_by)}, ${fmtDate(inc.triaged_at)}` : 'Not yet'} />
          <Meta label="Investigation required" value={inc.investigation_required ? 'Yes' : 'No'} />
          <Meta label="RIDDOR review" value={RIDDOR_REVIEW_STATUS_LABELS[inc.riddor_review_status] ?? inc.riddor_review_status} />
          {inc.closed_at && <Meta label="Closed" value={`${nameOf(dir, inc.closed_by)}, ${fmtDate(inc.closed_at)}`} />}
        </dl>
        <Block title="What happened">{inc.description}</Block>
        {inc.activity_underway && <Block title="Activity underway">{inc.activity_underway}</Block>}
        {(inc.immediate_actions.length > 0 || inc.immediate_action) && (
          <Block title="Immediate actions">
            {[...inc.immediate_actions.map(a => INCIDENT_IMMEDIATE_ACTION_LABELS[a as IncidentImmediateAction] ?? a), inc.immediate_action].filter(Boolean).join('; ')}
          </Block>
        )}
        {inc.close_override_reason && <Block title="Closed with an override — reason">{inc.close_override_reason}</Block>}
        {!canRead && isReporter && (
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>You are seeing your own report. The investigation, RIDDOR review and actions are visible to the H&amp;S team.</p>
        )}
      </section>

      <IncidentManage incident={inc} canInvestigate={canInvestigate} canApprove={canApprove} blockers={blockers}
        sites={sites} departments={departments} people={orgPeople} riskAssessments={raOpts} assets={linkOptions.equipment} />

      <IncidentPeople companyId={companyId} incidentId={inc.id} rows={people}
        sensitive={canSensitive ? ((sensRes.data ?? []) as SensitiveRow[]) : null} people={orgPeople}
        canEdit={canInvestigate && open} canSensitive={canSensitive} open={open} />

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Evidence</h2>
        {!canSensitive && <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}><Lock size={12} /> Witness statements and medical evidence are shown only to people authorised to see them.</p>}
        <EvidencePanel companyId={companyId} entityType="incident" entityId={inc.id} files={files}
          canUpload={open && (canInvestigate || isReporter)} sensitiveTypes={canSensitive} />
      </section>

      {canRead && (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Risk, equipment and controls</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Meta label="Risk assessment covering the work" value={inc.no_assessment_existed
              ? <span style={{ color: 'var(--gold)' }}>No assessment existed</span>
              : inc.linked_risk_assessment_id ? <Link href={docPath('risk_assessment', inc.linked_risk_assessment_id)}>{raLabel}</Link> : 'Not linked'} />
            <Meta label="Equipment / asset" value={assetLabel ?? 'Not linked'} />
            {inc.linked_contractor_id && <Meta label="Contractor" value={personName(inc.linked_contractor_id)} />}
          </dl>
          <IncidentLinks incidentId={inc.id} incidentNumber={inc.incident_number} companyId={companyId} siteId={inc.site_id} links={resolved}
            options={linkOptions} canLink={canInvestigate} canAssign={canAssign}
            linkedRa={inc.linked_risk_assessment_id && raLabel ? { id: inc.linked_risk_assessment_id, label: raLabel } : null} />
        </section>
      )}

      {canRead && (
        <InvestigationPanel companyId={companyId} incidentId={inc.id} incidentOpen={open} investigation={inv}
          timeline={(tlRes.data ?? []) as unknown as TimelineRow[]} causes={(causeRes.data ?? []) as unknown as CauseRow[]}
          whys={(whyRes.data ?? []) as unknown as WhyRow[]} dir={dir} orgPeople={orgPeople} userId={ctx.userId}
          canInvestigate={canInvestigate} canApprove={canApprove} prompts={prompts} />
      )}
      {canRead && inv && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Investigation evidence</h2>
          <EvidencePanel companyId={companyId} entityType="investigation" entityId={inv.id} files={invFiles}
            canUpload={canInvestigate && open} sensitiveTypes={canSensitive} />
        </section>
      )}

      {canRead && people.length > 0 && (
        <IncidentTraining incidentId={inc.id} dir={dir} canRecord={canInvestigate && open}
          evidence={canInvestigate || canApprove ? ((trainEvRes.data ?? []) as TrainingEvidenceRow[]) : null}
          evidenceFailed={'error' in trainEvRes && !!trainEvRes.error}
          checks={(trainChkRes.data ?? []) as unknown as TrainingCheckRow[]}
          people={people.map(p => ({
            incidentPersonId: p.id, onRecord: !!p.person_id,
            name: p.person_id ? personName(p.person_id) : p.external_name ?? '—',
            role: INCIDENT_PERSON_ROLE_LABELS[p.role_in_incident as IncidentPersonRole] ?? humanise(p.role_in_incident),
          }))} />
      )}

      {(riddor || canInvestigate || canRiddor) && (
        <RiddorPanel companyId={companyId} incidentId={inc.id} incidentStatus={inc.riddor_review_status} review={riddor}
          canEditPrompts={canInvestigate} canDecide={canRiddor} dir={dir} open={open} />
      )}

      {canRead && (
        <section className="card p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Corrective actions</h2>
            <Link href="/protect/actions?safety=all" className="text-xs ml-auto">All safety actions</Link>
          </div>
          {['major', 'critical', 'fatal'].includes(inc.severity ?? '') && (
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Actions from this incident must be verified by someone other than the person who did the work.</p>
          )}
          {actions.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No corrective actions raised yet.</p> : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Action</th><th>Type</th><th>From</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
                <tbody>
                  {actions.map(a => (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td>{a.action_class ? ACTION_CLASS_LABELS[a.action_class as ActionClass] : '—'}</td>
                      <td>{a.source_type === 'investigation' ? 'Investigation' : 'Incident'}</td>
                      <td>{a.assigned_to ? nameOf(dir, a.assigned_to) : 'Unassigned'}</td>
                      <td className="whitespace-nowrap">{fmtDate(a.due_date)}</td>
                      <td>
                        <Pill tone={toneFor(a.status)}>{ACTION_STATUS_LABELS[a.status] ?? a.status}</Pill>
                        {a.verification_required && a.status === 'complete' && a.verified_at && <span className="text-xs ml-1" style={{ color: 'var(--teal)' }}>verified</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canAssign && open && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>From the incident</p>
                <RaiseAction companyId={companyId} sourceType="incident" sourceId={inc.id} siteId={inc.site_id} people={dir}
                  defaultClass="immediate_correction" defaultTitle={`${inc.incident_number}: `} /></div>
              {inv && <div><p className="text-xs mb-1" style={{ color: 'var(--ink-faint)' }}>From the investigation ({inv.reference})</p>
                <RaiseAction companyId={companyId} sourceType="investigation" sourceId={inv.id} siteId={inc.site_id} people={dir}
                  defaultClass="corrective" defaultTitle={`${inv.reference}: `} /></div>}
            </div>
          )}
        </section>
      )}

      {canRead && events.length > 0 && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>History</h2>
          <ul className="text-sm space-y-1">
            {events.map(e => (
              <li key={e.id} className="flex flex-wrap gap-2">
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-faint)' }}>{fmtDateTime(e.occurred_at)}</span>
                <span style={{ color: 'var(--ink-soft)' }}>{e.summary}</span>
                {e.actor_id && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>— {nameOf(dir, e.actor_id)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</dt><dd style={{ color: 'var(--ink)' }}>{value}</dd></div>;
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>{title}</h3><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{children}</p></div>;
}
