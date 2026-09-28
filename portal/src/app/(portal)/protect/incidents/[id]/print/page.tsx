import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSafetyContext, orgDirectory, orgSitesAndDepartments, nameOf, fmtDate, fmtDateTime } from '@/lib/hs/safetyContext';
import { HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_STATUS_LABELS, HS_INCIDENT_TYPE_LABELS } from '@/lib/hs/vocab';
import {
  ACTION_CLASS_LABELS, CAUSE_CATEGORY_LABELS, CAUSE_LEVEL_LABELS, HOSPITAL_ATTENDANCE_LABELS, INCIDENT_IMMEDIATE_ACTION_LABELS,
  INCIDENT_PERSON_ROLE_LABELS, INVESTIGATION_STATUS_LABELS, RIDDOR_DECISION_LABELS, RIDDOR_FLAGS, RIDDOR_FLAG_LABELS,
  RIDDOR_REVIEW_STATUS_LABELS, TREATMENT_LABELS, humanise,
  type ActionClass, type CauseCategory, type CauseLevel, type IncidentImmediateAction, type IncidentPersonRole,
} from '@/lib/hs/safetyVocab';
import { ACTION_STATUS_LABELS } from '@/lib/ui/statusMaps';
import PrintShell, { PrintSection } from '@/components/safety/PrintShell';
import type { CauseRow, IncidentPersonRow, IncidentRow, InvestigationRow, RiddorRow, SensitiveRow, TimelineRow, WhyRow } from '../types';

export const metadata: Metadata = { title: 'Incident report' };
export const dynamic = 'force-dynamic';

const EMPTY = Promise.resolve({ data: [] as Record<string, unknown>[] });
const SENSITIVE_EVIDENCE = ['witness_statement', 'medical'];

// The printable incident report (spec §82). Sensitive fields obey the
// same rule as the screen: injury records and witness / medical
// evidence appear only for someone holding incident.sensitive.read, and
// are not even fetched otherwise. Structured HTML — the browser's
// "Save as PDF" produces the PDF.
export default async function IncidentPrintPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getSafetyContext();
  const { supabase, companyId } = ctx;
  if (!companyId) notFound();
  const canSensitive = ctx.can('incident.sensitive.read');

  const { data: incData } = await supabase.from('hs_incidents')
    .select('id, company_id, incident_number, incident_type, title, description, occurred_on, incident_time, reported_at, reported_by, person_in_charge_id, site_id, department_id, exact_location, activity_underway, immediate_action, immediate_actions, severity, severity_confirmed_by, severity_confirmed_at, status, investigation_required, riddor_review_status, riddor_reportable, riddor_reported_on, linked_risk_assessment_id, no_assessment_existed, linked_asset_id, linked_contractor_id, triaged_by, triaged_at, closed_by, closed_at, close_override_reason, archived_at, row_version')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (!incData) notFound();
  const inc = incData as IncidentRow;

  const [dir, { sites, departments }, org, peopleRes, filesRes, invRes, riddorRes, actRes] = await Promise.all([
    orgDirectory(supabase),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
    supabase.from('incident_people').select('id, person_id, external_name, role_in_incident, employer, created_at').eq('incident_id', id).order('created_at').limit(200),
    supabase.from('hs_files').select('id, file_name, evidence_type, description, created_at').eq('entity_type', 'incident').eq('entity_id', id).order('created_at').limit(200),
    supabase.from('incident_investigations').select('id, reference, lead_investigator_id, team_member_ids, started_at, target_completion_date, completed_at, summary, sequence_of_events, immediate_causes, underlying_causes, root_causes, contributing_factors, findings, lessons_learned, status, submitted_at, submitted_by, review_comments, approved_by, approved_at, row_version').eq('incident_id', id).maybeSingle(),
    supabase.from('riddor_reviews').select('id, death, specified_injury, over_seven_day_incapacity, dangerous_occurrence, occupational_disease, gas_incident, non_worker_hospital, notes, status, decision, decision_by, decision_at, rationale, reporting_reference, report_date, row_version').eq('incident_id', id).maybeSingle(),
    supabase.from('actions').select('id, title, status, action_class, due_date, assigned_to, verified_at, verified_by, completed_at').eq('source_type', 'incident').eq('source_id', id).order('created_at').limit(200),
  ]);
  const people = (peopleRes.data ?? []) as IncidentPersonRow[];
  const inv = (invRes.data ?? null) as InvestigationRow | null;
  const riddor = (riddorRes.data ?? null) as RiddorRow | null;

  const personIds = people.map(p => p.person_id).filter((x): x is string => !!x);
  const [tlRes, causeRes, whyRes, invFilesRes, invActRes, sensRes, orgPeopleRes] = await Promise.all([
    inv ? supabase.from('incident_timeline_events').select('id, sequence, event_time, title, description, person_id').eq('investigation_id', inv.id).order('sequence').limit(500) : EMPTY,
    inv ? supabase.from('incident_causes').select('id, cause_level, category, description, confirmed_by, confirmed_at').eq('investigation_id', inv.id).order('created_at').limit(200) : EMPTY,
    inv ? supabase.from('investigation_why_analyses').select('id, problem, whys, conclusion, linked_cause_id').eq('investigation_id', inv.id).order('created_at').limit(100) : EMPTY,
    inv ? supabase.from('hs_files').select('id, file_name, evidence_type, description, created_at').eq('entity_type', 'investigation').eq('entity_id', inv.id).order('created_at').limit(200) : EMPTY,
    inv ? supabase.from('actions').select('id, title, status, action_class, due_date, assigned_to, verified_at, verified_by, completed_at').eq('source_type', 'investigation').eq('source_id', inv.id).order('created_at').limit(200) : EMPTY,
    canSensitive && people.length
      ? supabase.from('incident_person_sensitive').select('incident_person_id, contact_phone, contact_email, contact_address, body_parts, injury_types, treatment, first_aid_given, hospital_attendance, time_lost, days_lost, work_restriction, return_date, notes, recorded_by, updated_at').in('incident_person_id', people.map(p => p.id)).limit(200)
      : Promise.resolve({ data: null }),
    personIds.length ? supabase.from('people').select('id, full_name').in('id', personIds).limit(200) : EMPTY,
  ]);

  const orgPeople = (orgPeopleRes.data ?? []) as { id: string; full_name: string }[];
  const personName = (p: IncidentPersonRow) => (p.person_id ? orgPeople.find(x => x.id === p.person_id)?.full_name ?? 'A person on record' : p.external_name ?? '—');
  const sensitive = (sensRes.data ?? []) as SensitiveRow[];
  type FileRow = { id: string; file_name: string; evidence_type: string; description: string | null; created_at: string };
  const allFiles = [...((filesRes.data ?? []) as FileRow[]), ...((invFilesRes.data ?? []) as unknown as FileRow[])];
  const files = canSensitive ? allFiles : allFiles.filter(f => !SENSITIVE_EVIDENCE.includes(f.evidence_type));
  const withheldFiles = allFiles.length - files.length;
  const timeline = (tlRes.data ?? []) as unknown as TimelineRow[];
  const causes = (causeRes.data ?? []) as unknown as CauseRow[];
  const whys = (whyRes.data ?? []) as unknown as WhyRow[];
  type Act = { id: string; title: string; status: string; action_class: string | null; due_date: string | null; assigned_to: string | null; verified_at: string | null; verified_by: string | null; completed_at: string | null };
  const actions = [...((actRes.data ?? []) as Act[]), ...((invActRes.data ?? []) as unknown as Act[])];
  const where = [sites.find(s => s.id === inc.site_id)?.name, departments.find(d => d.id === inc.department_id)?.name, inc.exact_location].filter(Boolean).join(' · ') || '—';
  const immediate = [...inc.immediate_actions.map(a => INCIDENT_IMMEDIATE_ACTION_LABELS[a as IncidentImmediateAction] ?? a), inc.immediate_action].filter(Boolean);
  const text = (t: string | null | undefined) => <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{t || '—'}</p>;
  const withheld = <p className="text-sm italic" style={{ color: 'var(--ink-faint)' }}>Injury, treatment and contact details are withheld: you are not authorised to see medical information.</p>;

  return (
    <PrintShell title={`Incident report — ${inc.title ?? HS_INCIDENT_TYPE_LABELS[inc.incident_type]}`} organisation={(org.data?.name as string) ?? ''}
      reference={inc.incident_number} meta={[
        { label: 'Type', value: HS_INCIDENT_TYPE_LABELS[inc.incident_type] },
        { label: 'Date / time', value: `${fmtDate(inc.occurred_on)}${inc.incident_time ? ` ${inc.incident_time.slice(0, 5)}` : ''}` },
        { label: 'Location', value: where },
        { label: 'Status', value: HS_INCIDENT_STATUS_LABELS[inc.status] },
        { label: 'Severity', value: inc.severity && inc.severity_confirmed_at ? `${HS_INCIDENT_SEVERITY_LABELS[inc.severity]} (confirmed by ${nameOf(dir, inc.severity_confirmed_by)})` : 'Unconfirmed' },
        { label: 'Reported by', value: nameOf(dir, inc.reported_by) },
        { label: 'Reported', value: fmtDateTime(inc.reported_at) },
        { label: 'RIDDOR review', value: RIDDOR_REVIEW_STATUS_LABELS[inc.riddor_review_status] ?? inc.riddor_review_status },
      ]}>
      <PrintSection title="What happened">
        {text(inc.description)}
        {inc.activity_underway && <><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Activity underway</p>{text(inc.activity_underway)}</>}
      </PrintSection>

      <PrintSection title="Immediate action">
        {immediate.length ? <ul className="list-disc pl-5 text-sm">{immediate.map((a, i) => <li key={i}>{a}</li>)}</ul> : text(null)}
      </PrintSection>

      <PrintSection title="People">
        {people.length === 0 ? text('No people recorded.') : (
          <table className="table text-sm">
            <thead><tr><th>Name</th><th>Role</th><th>Employer</th>{canSensitive && <th>Injury / treatment</th>}</tr></thead>
            <tbody>
              {people.map(p => {
                const s = sensitive.find(x => x.incident_person_id === p.id);
                return (
                  <tr key={p.id}>
                    <td>{personName(p)}</td>
                    <td>{INCIDENT_PERSON_ROLE_LABELS[p.role_in_incident as IncidentPersonRole] ?? humanise(p.role_in_incident)}</td>
                    <td>{p.employer ?? '—'}</td>
                    {canSensitive && <td>{s ? [
                      s.body_parts.length ? `Body: ${s.body_parts.map(humanise).join(', ')}` : null,
                      s.injury_types.length ? `Injury: ${s.injury_types.map(humanise).join(', ')}` : null,
                      s.treatment ? `Treatment: ${TREATMENT_LABELS[s.treatment as keyof typeof TREATMENT_LABELS]}` : null,
                      s.hospital_attendance ? `Hospital: ${HOSPITAL_ATTENDANCE_LABELS[s.hospital_attendance as keyof typeof HOSPITAL_ATTENDANCE_LABELS]}` : null,
                      s.time_lost ? `Time lost${s.days_lost != null ? `: ${s.days_lost} day(s)` : ''}` : null,
                      s.work_restriction ? `Restriction: ${s.work_restriction}` : null,
                      s.return_date ? `Return: ${fmtDate(s.return_date)}` : null,
                    ].filter(Boolean).join('; ') || '—' : '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!canSensitive && people.length > 0 && withheld}
      </PrintSection>

      <PrintSection title="Evidence summary">
        {files.length === 0 ? text('No evidence attached.') : (
          <ul className="list-disc pl-5 text-sm">{files.map(f => <li key={f.id}>{humanise(f.evidence_type)}: {f.file_name}{f.description ? ` — ${f.description}` : ''} ({fmtDate(f.created_at)})</li>)}</ul>
        )}
        {!canSensitive && <p className="text-sm italic" style={{ color: 'var(--ink-faint)' }}>Witness statements and medical evidence are withheld{withheldFiles ? ` (${withheldFiles} item${withheldFiles === 1 ? '' : 's'})` : ''}: you are not authorised to see them.</p>}
      </PrintSection>

      <PrintSection title="Investigation">
        {!inv ? text(inc.investigation_required ? 'An investigation is required but has not been opened.' : 'No investigation recorded.') : (
          <div className="space-y-2 text-sm">
            <p><strong>{inv.reference}</strong> · {INVESTIGATION_STATUS_LABELS[inv.status]} · Lead: {nameOf(dir, inv.lead_investigator_id)}
              {inv.team_member_ids.length ? ` · Team: ${inv.team_member_ids.map(t => nameOf(dir, t)).join(', ')}` : ''}
              {inv.approved_at ? ` · Approved by ${nameOf(dir, inv.approved_by)} on ${fmtDate(inv.approved_at)}` : ''}</p>
            {([['Summary', inv.summary], ['Sequence of events', inv.sequence_of_events], ['Contributing factors', inv.contributing_factors],
              ['Findings', inv.findings], ['Lessons learned', inv.lessons_learned]] as const).map(([l, v]) => v ? (
              <div key={l}><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{l}</p>{text(v)}</div>) : null)}
            {timeline.length > 0 && (
              <div><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Timeline</p>
                <ol className="list-decimal pl-5">{timeline.map(t => <li key={t.id}>{t.event_time ? `${fmtDateTime(t.event_time)} — ` : ''}{t.title}{t.description ? `: ${t.description}` : ''}</li>)}</ol></div>
            )}
          </div>
        )}
      </PrintSection>

      <PrintSection title="Causes">
        {causes.length === 0 && !inv?.immediate_causes && !inv?.underlying_causes && !inv?.root_causes ? text('No causes recorded.') : (
          <div className="space-y-2 text-sm">
            {causes.length > 0 && (
              <table className="table text-sm">
                <thead><tr><th>Level</th><th>Category</th><th>Cause</th><th>Confirmed</th></tr></thead>
                <tbody>{causes.map(c => (
                  <tr key={c.id}><td>{CAUSE_LEVEL_LABELS[c.cause_level as CauseLevel]}</td><td>{CAUSE_CATEGORY_LABELS[c.category as CauseCategory]}</td>
                    <td>{c.description}</td><td>{c.confirmed_at ? `${nameOf(dir, c.confirmed_by)}, ${fmtDate(c.confirmed_at)}` : 'Not confirmed'}</td></tr>
                ))}</tbody>
              </table>
            )}
            {whys.map(w => (
              <div key={w.id}><p><strong>5 Whys — </strong>{w.problem}</p>
                <ol className="list-decimal pl-5">{w.whys.map((x, i) => <li key={i}>{x}</li>)}</ol>
                {w.conclusion && <p>Conclusion: {w.conclusion}</p>}</div>
            ))}
            {([['Immediate causes', inv?.immediate_causes], ['Underlying causes', inv?.underlying_causes], ['Root causes', inv?.root_causes]] as const).map(([l, v]) => v ? (
              <div key={l}><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{l}</p>{text(v)}</div>) : null)}
          </div>
        )}
      </PrintSection>

      <PrintSection title="Corrective actions">
        {actions.length === 0 ? text('No corrective actions recorded.') : (
          <table className="table text-sm">
            <thead><tr><th>Action</th><th>Type</th><th>Owner</th><th>Due</th><th>Status</th><th>Verified</th></tr></thead>
            <tbody>{actions.map(a => (
              <tr key={a.id}><td>{a.title}</td><td>{a.action_class ? ACTION_CLASS_LABELS[a.action_class as ActionClass] : '—'}</td>
                <td>{a.assigned_to ? nameOf(dir, a.assigned_to) : 'Unassigned'}</td><td>{fmtDate(a.due_date)}</td>
                <td>{ACTION_STATUS_LABELS[a.status] ?? a.status}</td><td>{a.verified_at ? `${nameOf(dir, a.verified_by)}, ${fmtDate(a.verified_at)}` : '—'}</td></tr>
            ))}</tbody>
          </table>
        )}
      </PrintSection>

      <PrintSection title="RIDDOR decision">
        {!riddor ? text(`RIDDOR review status: ${RIDDOR_REVIEW_STATUS_LABELS[inc.riddor_review_status] ?? inc.riddor_review_status}.`) : (
          <div className="space-y-1 text-sm">
            <ul className="pl-0">{RIDDOR_FLAGS.map(k => <li key={k}>{RIDDOR_FLAG_LABELS[k]} <strong>{riddor[k] == null ? 'Not known' : riddor[k] ? 'Yes' : 'No'}</strong></li>)}</ul>
            <p>Decision: <strong>{riddor.decision ? RIDDOR_DECISION_LABELS[riddor.decision] : 'None recorded'}</strong>
              {riddor.decision_at ? ` — ${nameOf(dir, riddor.decision_by)}, ${fmtDate(riddor.decision_at)}` : ''}</p>
            {riddor.rationale && <><p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Rationale</p>{text(riddor.rationale)}</>}
            {riddor.decision === 'reportable' && <p>HSE reference: {riddor.reporting_reference ?? 'not recorded'} · Report date: {fmtDate(riddor.report_date)}</p>}
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Core OS 360 does not submit reports to the HSE. The decision above was made and recorded by a person.</p>
          </div>
        )}
      </PrintSection>

      <PrintSection title="Closure">
        {inc.closed_at
          ? <div className="text-sm space-y-1"><p>Closed by {nameOf(dir, inc.closed_by)} on {fmtDate(inc.closed_at)}.</p>
              {inc.close_override_reason && <p>Closed with an override. Reason: {inc.close_override_reason}</p>}</div>
          : text('Not closed.')}
      </PrintSection>
    </PrintShell>
  );
}
