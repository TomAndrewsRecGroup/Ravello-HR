import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgSitesAndDepartments, fmtDate, fmtDateTime, todayIso } from '@/lib/hs/safetyContext';
import {
  ASSESSMENT_METHOD_LABELS, DEPLOYMENT_STATUS_LABELS, ENGAGEMENT_LABELS, HEALTH_OUTCOME_LABELS, LIFECYCLE_LABELS,
  REQUIREMENT_STATUS_LABELS, REQUIREMENT_TYPE_LABELS, VERIFICATION_LABELS, WORKER_TYPE_LABELS, workforcePersonPath,
  type AssessmentMethod, type EngagementType, type HealthOutcome, type LifecycleStatus, type RequirementType, type VerificationStatus,
} from '@/lib/workforce/vocab';
import { groupRequirements, latestFirstBy, openSuspension, printShowsHealth, sourcesText } from '@/lib/workforce/profile';
import PrintShell, { PrintSection } from '@/components/safety/PrintShell';
import { loadProfile, titles } from '../loadProfile';

export const metadata: Metadata = { title: 'Person compliance record' };
export const dynamic = 'force-dynamic';

// The printable person compliance record (spec 103). Structured HTML,
// the browser's "Save as PDF" makes the PDF. It shows what the engine
// says today and the evidence behind it. Occupational health appears
// only for a summary reader, as category and dates — no provider, no
// restriction text — and nothing clinical is ever fetched.
export default async function PersonPrintPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  const showHealth = printShowsHealth(ctx.can);

  const denied = (
    <main className="portal-page flex-1">
      <div className="card p-6 space-y-2">
        <p className="font-medium" style={{ color: 'var(--ink)' }}>You cannot see this person</p>
        <Link href={workforcePersonPath(id)} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> Back</Link>
      </div>
    </main>
  );
  if (!companyId) return denied;

  const [data, { sites, departments }, org] = await Promise.all([
    loadProfile(supabase, companyId, id, null, { health: showHealth ? 'print' : false, incidents: false, duplicates: false, extras: false }),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ]);
  if (data.cannotSee || !data.person) return denied;
  const p = data.person;
  const today = todayIso();
  const cat = data.catalogue;
  const names = {
    roles: titles(cat.roles),
    sites: Object.fromEntries(sites.map(s => [s.id, s.name])) as Record<string, string>,
  };
  const depts = Object.fromEntries(departments.map(d => [d.id, d.name])) as Record<string, string>;
  const dep = data.deployment;
  const currentRoles = data.assignments.filter(a => a.assignment_status !== 'ended');
  const verification = (s: string) => VERIFICATION_LABELS[s as VerificationStatus] ?? s;
  const expiry = (d: string | null) => (d ? `${fmtDate(d)}${d < today ? ' (expired)' : ''}` : 'No expiry');

  return (
    <PrintShell
      title={`Compliance record — ${p.preferred_name ? `${p.preferred_name} (${p.full_name})` : p.full_name}`}
      organisation={(org.data?.name as string | undefined) ?? 'Organisation'}
      reference={p.employee_number ? `Employee ${p.employee_number}` : fmtDate(today)}
      meta={[
        { label: 'Safe to Deploy', value: dep ? DEPLOYMENT_STATUS_LABELS[dep.status] ?? dep.status : 'Not available' },
        { label: 'Calculated', value: dep ? fmtDateTime(dep.computed_at) : '—' },
        { label: 'Worker type', value: WORKER_TYPE_LABELS[p.worker_type] ?? p.worker_type },
        { label: 'Lifecycle', value: p.lifecycle_status ? LIFECYCLE_LABELS[p.lifecycle_status as LifecycleStatus] ?? p.lifecycle_status : '—' },
        { label: 'Engagement', value: p.engagement_type ? ENGAGEMENT_LABELS[p.engagement_type as EngagementType] ?? p.engagement_type : '—' },
        { label: 'Site', value: p.site_id ? names.sites[p.site_id] ?? '—' : '—' },
        { label: 'Department', value: p.department_id ? depts[p.department_id] ?? '—' : '—' },
        { label: 'Start date', value: fmtDate(p.start_date) },
      ]}>
      <div className="no-print">
        <Link href={workforcePersonPath(p.id)} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}><ArrowLeft size={14} /> Back to profile</Link>
      </div>

      <PrintSection title="Roles">
        {currentRoles.length === 0 ? <p className="text-sm">No current role.</p> : (
          <table className="table text-sm">
            <thead><tr><th scope="col">Role</th><th scope="col">Site</th><th scope="col">Primary</th><th scope="col">From</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {currentRoles.map(a => (
                <tr key={a.id}>
                  <td>{names.roles[a.role_id] ?? 'Role'}</td>
                  <td>{a.site_id ? names.sites[a.site_id] ?? '—' : '—'}</td>
                  <td>{a.primary_assignment ? 'Yes' : 'No'}</td>
                  <td>{fmtDate(a.start_date)}</td>
                  <td>{a.assignment_status === 'planned' ? 'Planned' : 'Active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PrintSection>

      <PrintSection title="Safe to Deploy">
        {!dep ? <p className="text-sm">The status could not be read{data.deploymentError ? `: ${data.deploymentError}` : ''}.</p> : (
          <>
            <p className="text-sm"><strong>{DEPLOYMENT_STATUS_LABELS[dep.status] ?? dep.status}</strong> — {dep.summary.required} required, {dep.summary.met} met, {dep.summary.unmet} not met, {dep.summary.review} awaiting verification, {dep.summary.conditional} conditional, {dep.summary.expiring} expiring.</p>
            {dep.reasons.length > 0 && (
              <ul className="list-disc pl-5 text-sm">
                {dep.reasons.map((r, i) => <li key={i}>{r.text}{r.safety_critical ? ' — safety-critical' : ''}</li>)}
              </ul>
            )}
            {dep.requirements.length > 0 && (
              <table className="table text-sm">
                <thead><tr><th scope="col">Requirement</th><th scope="col">Mandatory</th><th scope="col">Safety-critical</th><th scope="col">Status</th><th scope="col">Evidence date</th><th scope="col">Expires</th><th scope="col">Comes from</th></tr></thead>
                {groupRequirements(dep.requirements).map(g => (
                  <tbody key={g.type}>
                    <tr><th scope="colgroup" colSpan={7}>{g.label}</th></tr>
                    {g.items.map((r, i) => (
                      <tr key={`${r.reference_id ?? r.reference_key}-${i}`}>
                        <td>{r.name ?? '—'}{r.detail ? ` — ${r.detail}` : ''}</td>
                        <td>{r.mandatory ? 'Yes' : 'No'}</td>
                        <td>{r.safety_critical ? 'Yes' : 'No'}</td>
                        <td>{REQUIREMENT_STATUS_LABELS[r.status] ?? r.status}</td>
                        <td>{fmtDate(r.evidence_date)}</td>
                        <td>{fmtDate(r.expires_on)}</td>
                        <td>{sourcesText(r, names)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </>
        )}
      </PrintSection>

      <PrintSection title="Training">
        {data.training.length === 0 ? <p className="text-sm">None recorded.</p> : (
          <table className="table text-sm">
            <thead><tr><th scope="col">Course</th><th scope="col">Completed</th><th scope="col">Result</th><th scope="col">Expires</th><th scope="col">Verification</th></tr></thead>
            <tbody>
              {data.training.map(r => (
                <tr key={r.id}>
                  <td>{r.course_name}</td>
                  <td>{fmtDate(r.completed_on)}</td>
                  <td>{r.result === 'pass' ? 'Passed' : r.result === 'fail' ? 'Failed' : 'Attended'}</td>
                  <td>{expiry(r.expires_on)}</td>
                  <td>{verification(r.verification_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PrintSection>

      <PrintSection title="Competencies">
        {data.competencies.length === 0 ? <p className="text-sm">None assessed.</p> : (
          <table className="table text-sm">
            <thead><tr><th scope="col">Competency</th><th scope="col">Level</th><th scope="col">Assessed</th><th scope="col">Method</th><th scope="col">Expires</th><th scope="col">Verification</th></tr></thead>
            <tbody>
              {latestFirstBy(data.competencies, r => r.competency_id, r => `${r.assessed_on}|${r.created_at}`).map(g => {
                const r = g.latest;
                const susp = openSuspension(data.suspensions.filter(s => s.competency_id === g.key));
                return (
                  <tr key={g.key}>
                    <td>{titles(cat.competencies)[g.key] ?? 'Competency'}{susp ? ' — SUSPENDED' : ''}</td>
                    <td>{cat.levels.find(l => l.id === r.level_id)?.label ?? '—'}</td>
                    <td>{fmtDate(r.assessed_on)}</td>
                    <td>{ASSESSMENT_METHOD_LABELS[r.assessment_method as AssessmentMethod] ?? r.assessment_method}</td>
                    <td>{expiry(r.expires_on)}</td>
                    <td>{verification(r.verification_status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PrintSection>

      <PrintSection title="Qualifications and licences">
        {data.credentials.length === 0 ? <p className="text-sm">None recorded.</p> : (
          <table className="table text-sm">
            <thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Number</th><th scope="col">Issued</th><th scope="col">Expires</th><th scope="col">Verification</th></tr></thead>
            <tbody>
              {data.credentials.map(c => {
                const t = cat.credentialTypes.find(x => x.id === c.credential_type_id);
                return (
                  <tr key={c.id}>
                    <td>{t?.title ?? 'Credential'}</td>
                    <td>{t ? REQUIREMENT_TYPE_LABELS[t.kind as RequirementType] ?? t.kind : '—'}</td>
                    <td>{c.credential_number || '—'}</td>
                    <td>{fmtDate(c.issued_on)}</td>
                    <td>{expiry(c.expires_on)}</td>
                    <td>{verification(c.verification_status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PrintSection>

      <PrintSection title="Inductions">
        {data.inductionCompletions.length === 0 && data.inductionAssignments.length === 0 ? <p className="text-sm">None.</p> : (
          <table className="table text-sm">
            <thead><tr><th scope="col">Induction</th><th scope="col">Assigned</th><th scope="col">Required before</th><th scope="col">Completed</th><th scope="col">Re-induction due</th></tr></thead>
            <tbody>
              {[...new Set([...data.inductionAssignments.map(a => a.induction_template_id), ...data.inductionCompletions.map(c => c.induction_template_id)])].map(tid => {
                const a = data.inductionAssignments.find(x => x.induction_template_id === tid);
                const c = data.inductionCompletions.find(x => x.induction_template_id === tid);
                return (
                  <tr key={tid}>
                    <td>{titles(cat.inductions)[tid] ?? 'Induction'}</td>
                    <td>{fmtDate(a?.assigned_on)}</td>
                    <td>{fmtDate(a?.required_before)}</td>
                    <td>{fmtDate(c?.completed_on)}</td>
                    <td>{fmtDate(c?.reinduction_due)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PrintSection>

      <PrintSection title="Authorisations">
        {data.authorisations.length === 0 ? <p className="text-sm">None issued.</p> : (
          <table className="table text-sm">
            <thead><tr><th scope="col">Authorisation</th><th scope="col">Scope</th><th scope="col">Issued</th><th scope="col">Expires</th><th scope="col">State</th></tr></thead>
            <tbody>
              {data.authorisations.map(a => {
                const susp = openSuspension(data.authSuspensions.filter(s => s.authorisation_id === a.id));
                return (
                  <tr key={a.id}>
                    <td>{titles(cat.authTypes)[a.authorisation_type_id] ?? 'Authorisation'}</td>
                    <td>{[a.scope_site_id ? names.sites[a.scope_site_id] : 'Any site', a.scope_detail].filter(Boolean).join(' · ')}</td>
                    <td>{fmtDate(a.issued_on)}</td>
                    <td>{expiry(a.expires_on)}</td>
                    <td>{a.status === 'revoked' ? 'Revoked' : susp ? 'Suspended' : 'Active'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PrintSection>

      {showHealth && (
        <PrintSection title="Occupational health (outcome and dates only)">
          {data.health.length === 0 ? <p className="text-sm">No outcomes recorded.</p> : (
            <table className="table text-sm">
              <thead><tr><th scope="col">Assessment</th><th scope="col">Outcome</th><th scope="col">Assessed</th><th scope="col">Review</th></tr></thead>
              <tbody>
                {data.health.map(h => (
                  <tr key={h.id}>
                    <td>{h.requirement_id ? titles(cat.ohRequirements)[h.requirement_id] ?? 'Assessment' : 'General assessment'}</td>
                    <td>{HEALTH_OUTCOME_LABELS[h.outcome as HealthOutcome] ?? h.outcome}</td>
                    <td>{fmtDate(h.assessed_on)}</td>
                    <td>{fmtDate(h.review_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PrintSection>
      )}
    </PrintShell>
  );
}
