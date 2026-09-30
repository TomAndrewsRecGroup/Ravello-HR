import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Printer, ShieldAlert } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgSitesAndDepartments, fmtDate, fmtDateTime, param, todayIso } from '@/lib/hs/safetyContext';
import { workforceEvidenceUrl } from '@/lib/workforce/evidence';
import {
  ASSESSMENT_METHOD_LABELS, CHECK_STATUS_LABELS, DEPLOYMENT_STATUS_LABELS, ENGAGEMENT_LABELS, EXCEPTION_KIND_LABELS,
  HEALTH_OUTCOME_LABELS, LIFECYCLE_LABELS, REQUIREMENT_SOURCE_LABELS, REQUIREMENT_TYPE_LABELS, VERIFICATION_LABELS,
  WORKER_TYPE_LABELS, WORKFORCE_BASE, workforcePersonPath,
  type AssessmentMethod, type CheckStatus, type DeploymentStatus, type EngagementType, type ExceptionKind, type HealthOutcome,
  type LifecycleStatus, type RequirementSource, type RequirementType, type VerificationStatus,
} from '@/lib/workforce/vocab';
import {
  PROFILE_TAB_LABELS, duplicateMatchText, groupRequirements, historyItems, latestFirstBy, openSuspension, parseAsOf, parseTab,
  printHref, profileHref, sourcesText, verificationTone, visibleTabs, type ProfileTab, type Viewer,
} from '@/lib/workforce/profile';
import type { DeploymentRequirement } from '@/lib/workforce/types';
import { DeploymentBadge, RequirementBadge } from '@/components/workforce/DeploymentBadge';
import Pill, { toneFor } from '@/components/safety/Pill';
import { loadProfile, titles, type ProfileData } from './loadProfile';
import RpcAction from './RpcAction';
import RolePreview from './RolePreview';
import {
  AddCredentialForm, AddDevelopmentForm, AssignLearningButton, AssignRoleForm, EndAssignmentButton, IssueAuthorisationForm,
  RecordCompetencyForm, RecordTrainingForm,
} from './ProfileForms';
import type { SiteOption, DepartmentOption } from './rows';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { hasActiveWorkerQrToken } from '@/lib/workforce/qrTokens';
import WorkerBadgePanel from '@/components/workforce/WorkerBadgePanel';

export const metadata: Metadata = { title: 'Person compliance profile' };
export const dynamic = 'force-dynamic';

// The person compliance profile (spec 47). Every status on it is the
// Safe to Deploy engine's own result (136), shown with its reasons; the
// page never works one out. Occupational health appears only for summary
// readers and the person themselves, and never anything clinical.
export default async function PersonProfilePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <CannotSee />;

  const isMe = ctx.myPersonId === id;
  const viewer: Viewer = { can: ctx.can, isMe };
  const tabs = visibleTabs(viewer);
  const tab = parseTab(param(sp, 'tab'), tabs);
  const today = todayIso();
  const asOf = parseAsOf(param(sp, 'as_of'), today);

  const canManageBadge = ctx.can('workforce.manage');
  const [data, { sites, departments }, hasBadge, companyRow] = await Promise.all([
    loadProfile(supabase, companyId, id, asOf, {
      health: tabs.includes('occupational_health') ? 'full' : false,
      incidents: tabs.includes('safety'),
      duplicates: ctx.can('workforce.read') || ctx.can('people.write'),
      extras: true,
    }),
    orgSitesAndDepartments(supabase, companyId),
    // worker_qr_tokens is RLS-on-no-policies (service role only, 179) —
    // this read never touches the token itself, only whether an active
    // one exists.
    hasActiveWorkerQrToken(createServiceSupabaseClient(), id),
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ]);
  if (data.cannotSee || !data.person) return <CannotSee />;
  const p = data.person;

  // Evidence links for the open tab, signed under the viewer's own session.
  const paths = evidencePathsFor(tab, data);
  const signed = await Promise.all(paths.map(async k => [k, await workforceEvidenceUrl(supabase, k)] as const));
  const urls: Record<string, string> = Object.fromEntries(signed.filter(([, u]) => !!u) as [string, string][]);

  const cat = data.catalogue;
  const names = {
    roles: titles(cat.roles),
    sites: Object.fromEntries(sites.map(s => [s.id, s.name])) as Record<string, string>,
    departments: Object.fromEntries(departments.map(d => [d.id, d.name])) as Record<string, string>,
  };
  const display = p.preferred_name ? `${p.preferred_name} (${p.full_name})` : p.full_name;
  const status = data.deployment?.status as DeploymentStatus | undefined;
  const primaryRole = p.primary_role_id ? names.roles[p.primary_role_id] : null;

  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href={WORKFORCE_BASE} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}>
        <ArrowLeft size={14} /> Safe to Deploy
      </Link>

      <section className="card p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{display}</h1>
          {status && <DeploymentBadge status={status} />}
          {isMe && <Pill tone="info">You</Pill>}
          <Link href={printHref(p.id)} className="btn-secondary btn-sm ml-auto no-print"><Printer size={14} /> Print compliance record</Link>
        </div>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {WORKER_TYPE_LABELS[p.worker_type] ?? p.worker_type}
          {p.lifecycle_status && <> · {LIFECYCLE_LABELS[p.lifecycle_status as LifecycleStatus] ?? p.lifecycle_status}</>}
          {primaryRole && <> · {primaryRole}</>}
          {p.site_id && names.sites[p.site_id] && <> · {names.sites[p.site_id]}</>}
        </p>
      </section>

      <WorkerBadgePanel
        personId={p.id} hasActiveBadge={hasBadge} canManage={canManageBadge}
        fullName={display} employeeNumber={p.employee_number ?? null} companyName={companyRow.data?.name ?? ''}
      />

      <nav aria-label="Profile sections" className="flex flex-wrap gap-1 no-print">
        {tabs.map(t => (
          <Link key={t} href={profileHref(p.id, { tab: t, asOf })} aria-current={t === tab ? 'page' : undefined}
            className={t === tab ? 'btn-cta btn-sm' : 'btn-ghost btn-sm'}>
            {PROFILE_TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <Overview data={data} asOf={asOf} today={today} names={names} companyId={companyId}
          canDup={ctx.can('workforce.read') || ctx.can('people.write')} canAssign={ctx.can('training.manage')} />
      )}
      {tab === 'employment' && <Employment data={data} names={names} />}
      {tab === 'roles' && (
        <RolesTab data={data} names={names} companyId={companyId} manage={ctx.can('workforce.manage')}
          canPreview={ctx.can('workforce.read') || ctx.can('workforce.manage')} sites={sites} departments={departments} />
      )}
      {tab === 'training' && (
        <TrainingTab data={data} urls={urls} companyId={companyId} isMe={isMe} today={today}
          canRecord={ctx.can('training.manage')} canVerify={ctx.can('training.verify') && !isMe} />
      )}
      {tab === 'competency' && (
        <CompetencyTab data={data} urls={urls} companyId={companyId} today={today}
          canAssess={ctx.can('competency.assess') && !isMe} canVerify={ctx.can('competency.verify') && !isMe} />
      )}
      {tab === 'credentials' && (
        <CredentialsTab data={data} urls={urls} companyId={companyId} today={today}
          canAdd={ctx.can('training.manage')} canVerify={ctx.can('training.verify') && !isMe} />
      )}
      {tab === 'inductions' && <InductionsTab data={data} urls={urls} />}
      {tab === 'authorisations' && (
        <AuthorisationsTab data={data} urls={urls} names={names} companyId={companyId} today={today} sites={sites}
          canIssue={ctx.can('workforce.manage') && !isMe} canSuspend={ctx.can('competency.verify')} canRevoke={ctx.can('workforce.manage')} />
      )}
      {tab === 'pre_employment' && (
        <PreEmploymentTab data={data} urls={urls} canDecide={ctx.can('workforce.manage') && !isMe}
          canWaive={ctx.can('deployment.exception.approve') && !isMe} />
      )}
      {tab === 'occupational_health' && <HealthTab data={data} />}
      {tab === 'development' && <DevelopmentTab data={data} companyId={companyId} canAdd={ctx.can('training.manage')} />}
      {tab === 'safety' && <SafetyTab data={data} />}
      {tab === 'history' && <HistoryTab data={data} />}
    </main>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────

type Names = { roles: Record<string, string>; sites: Record<string, string>; departments: Record<string, string> };

function CannotSee() {
  return (
    <main className="portal-page flex-1 space-y-4">
      <Link href={WORKFORCE_BASE} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}>
        <ArrowLeft size={14} /> Safe to Deploy
      </Link>
      <div className="card p-10">
        <div className="empty-state">
          <ShieldAlert size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>You cannot see this person</p>
          <p className="text-sm max-w-[380px]" style={{ color: 'var(--ink-faint)' }}>
            They are outside the organisation you are working in, or you do not have access to their workforce record.
            Ask your administrator if you need it.
          </p>
        </div>
      </div>
    </main>
  );
}

function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="card p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
        {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{children}</p>;
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</dt><dd style={{ color: 'var(--ink)' }}>{value ?? '—'}</dd></div>;
}

function Verification({ status, reason }: { status: string; reason?: string | null }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Pill tone={verificationTone(status)}>{VERIFICATION_LABELS[status as VerificationStatus] ?? status}</Pill>
      {status === 'rejected' && reason && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{reason}</span>}
    </span>
  );
}

function Expiry({ date, today }: { date: string | null; today: string }) {
  if (!date) return <>No expiry</>;
  return <>{fmtDate(date)}{date < today ? <span style={{ color: 'var(--red)' }}> (expired)</span> : null}</>;
}

function EvidenceLink({ path, urls }: { path: string | null; urls: Record<string, string> }) {
  if (!path) return <>—</>;
  const url = urls[path];
  const name = path.split('/').pop()?.replace(/^[0-9a-f-]{36}-/, '') ?? 'File';
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{name}</a> : <>{name}</>;
}

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const typeLabel = (t: string) => REQUIREMENT_TYPE_LABELS[t as RequirementType] ?? t;

function evidencePathsFor(tab: ProfileTab, d: ProfileData): string[] {
  const list: (string | null)[] =
    tab === 'training' ? d.training.map(r => r.evidence_path)
    : tab === 'competency' ? d.competencies.map(r => r.evidence_path)
    : tab === 'credentials' ? d.credentials.map(r => r.evidence_path)
    : tab === 'inductions' ? d.inductionCompletions.map(r => r.evidence_path)
    : tab === 'authorisations' ? d.authorisations.map(r => r.evidence_path)
    : tab === 'pre_employment' ? d.checks.map(r => r.evidence_path)
    : [];
  return [...new Set(list.filter((x): x is string => !!x))].slice(0, 300);
}

// ─── Overview ───────────────────────────────────────────────────────

function Overview({ data, asOf, today, names, companyId, canDup, canAssign }: {
  data: ProfileData; asOf: string | null; today: string; names: Names; companyId: string; canDup: boolean; canAssign: boolean;
}) {
  const dep = data.deployment;
  const p = data.person!;
  const refName = (type: string, id: string | null, key: string | null) => {
    const c = data.catalogue;
    const map: Record<string, Record<string, string>> = {
      training: titles(c.courses), competency: titles(c.competencies), induction: titles(c.inductions),
      authorisation: titles(c.authTypes), ppe: titles(c.ppeTypes), pre_employment_check: titles(c.checkTypes),
      medical: titles(c.ohRequirements),
      qualification: titles(c.credentialTypes), certification: titles(c.credentialTypes), licence: titles(c.credentialTypes),
      card: titles(c.credentialTypes), permit: titles(c.credentialTypes),
    };
    return (id && map[type]?.[id]) || key || 'Requirement';
  };
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

  return (
    <>
      <Card title="Safe to Deploy">
        <div className="flex flex-wrap items-end gap-3 no-print">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="label">Status as of (historical view)</span>
              <input type="date" name="as_of" className="input" max={yesterday} defaultValue={asOf ?? ''} />
            </label>
            <button type="submit" className="btn-secondary btn-sm">Show</button>
          </form>
          {asOf && <Link href={profileHref(p.id)} className="btn-ghost btn-sm">Back to today</Link>}
        </div>
        {data.deploymentError && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>Safe to Deploy could not be read: {data.deploymentError}</p>}
        {dep && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <DeploymentBadge status={dep.status} />
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                {asOf ? `on ${fmtDate(asOf)} (calculated for that date)` : 'today'}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              Calculated {fmtDateTime(dep.computed_at)}{dep.source ? ` · ${dep.source === 'cache' ? 'stored result' : 'calculated now'}` : ''}
              {dep.valid_until ? ` · holds until ${fmtDate(dep.valid_until)}` : ''}
            </p>
            {dep.summary && (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                {dep.summary.required} required · {dep.summary.met} met · {dep.summary.unmet} not met · {dep.summary.review} awaiting verification
                · {dep.summary.conditional} conditional · {dep.summary.expiring} expiring
                {dep.summary.safety_critical_gap ? ' · a safety-critical requirement is not met' : ''}
              </p>
            )}
            {dep.reasons.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Why</h3>
                <ul className="list-disc pl-5 text-sm space-y-0.5" style={{ color: 'var(--ink)' }}>
                  {dep.reasons.map((r, i) => (
                    <li key={i}>{r.text}{r.safety_critical ? <strong> — safety-critical</strong> : null}</li>
                  ))}
                </ul>
              </div>
            ) : dep.status === 'READY' ? (
              <Empty>Every mandatory requirement is met.</Empty>
            ) : null}
            <RequirementTable reqs={dep.requirements} names={names} companyId={companyId} personId={p.id}
              canAssign={canAssign && !asOf} />
          </>
        )}
      </Card>

      {data.exceptions.length > 0 && (
        <Card title="Exceptions and waivers">
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Requirement</th><th scope="col">Kind</th><th scope="col">From</th><th scope="col">Until</th><th scope="col">Reason</th><th scope="col">State</th></tr></thead>
              <tbody>
                {data.exceptions.map(e => (
                  <tr key={e.id}>
                    <td>{typeLabel(e.requirement_type)}: {refName(e.requirement_type, e.reference_id, e.reference_key)}</td>
                    <td>{EXCEPTION_KIND_LABELS[e.kind as ExceptionKind] ?? e.kind}</td>
                    <td>{fmtDate(e.valid_from)}</td>
                    <td>{fmtDate(e.valid_until)}</td>
                    <td className="text-sm">{e.reason}</td>
                    <td>{e.revoked_at ? <Pill tone="muted">Revoked</Pill> : e.valid_until < today ? <Pill tone="muted">Ended</Pill> : <Pill tone="warn">In place</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.personRequirements.length > 0 && (
        <Card title="Requirements specific to this person">
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Requirement</th><th scope="col">Mandatory</th><th scope="col">Safety-critical</th><th scope="col">In force</th><th scope="col">Source</th></tr></thead>
              <tbody>
                {data.personRequirements.map(r => (
                  <tr key={r.id}>
                    <td>{typeLabel(r.requirement_type)}: {refName(r.requirement_type, r.reference_id, r.reference_key)}</td>
                    <td>{yesNo(r.mandatory)}</td>
                    <td>{yesNo(r.safety_critical)}</td>
                    <td>{r.effective_from ? `${fmtDate(r.effective_from)}${r.effective_until ? ` – ${fmtDate(r.effective_until)}` : ' onwards'}` : 'Draft'}</td>
                    <td>{r.source_type ? REQUIREMENT_SOURCE_LABELS[r.source_type as RequirementSource] ?? r.source_type : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canDup && (
        <Card title="Possible duplicates">
          {data.duplicatesError ? <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{data.duplicatesError}</p>
            : data.duplicates.length === 0 ? <Empty>No other record in this organisation shares this person’s email, phone number or name.</Empty> : (
            <>
              <ul className="text-sm space-y-1">
                {data.duplicates.map(d => (
                  <li key={d.person_id}>
                    <Link href={workforcePersonPath(d.person_id)} className="underline">{d.full_name}</Link>
                    <span style={{ color: 'var(--ink-faint)' }}> · {WORKER_TYPE_LABELS[d.worker_type] ?? d.worker_type} · {duplicateMatchText(d.matches)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                Records are never merged automatically. Review with your administrator before treating these as the same person.
              </p>
            </>
          )}
        </Card>
      )}
    </>
  );
}

function RequirementTable({ reqs, names, companyId, personId, canAssign }: {
  reqs: DeploymentRequirement[] | null | undefined; names: Names; companyId: string; personId: string; canAssign: boolean;
}) {
  if (!reqs || reqs.length === 0) return <Empty>No requirements apply. Assign a role, or add requirements to the person’s role or site.</Empty>;
  const groups = groupRequirements(reqs);
  // "Assign learning" only makes sense for the two requirement types
  // development_items can actually link to (linked_course_id /
  // linked_competency_id), and only once the engine has said the
  // requirement is genuinely unmet — a met or awaiting-verification one
  // needs no new development item.
  const assignable = (r: DeploymentRequirement) =>
    canAssign && r.status === 'unmet' && !!r.reference_id && (r.type === 'training' || r.type === 'competency');
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Requirement</th><th scope="col">Mandatory</th><th scope="col">Safety-critical</th><th scope="col">Status</th>
            <th scope="col">Detail</th><th scope="col">Evidence date</th><th scope="col">Expires</th><th scope="col">Required by</th><th scope="col">Comes from</th>
            {canAssign && <th scope="col"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        {groups.map(g => (
          <tbody key={g.type}>
            <tr><th scope="colgroup" colSpan={canAssign ? 10 : 9} style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)' }}>{g.label}</th></tr>
            {g.items.map((r, i) => (
              <tr key={`${r.reference_id ?? r.reference_key}-${i}`}>
                <th scope="row" style={{ fontWeight: 500 }}>{r.name ?? '—'}</th>
                <td>{yesNo(r.mandatory)}</td>
                <td>{r.safety_critical ? <strong>Yes</strong> : 'No'}</td>
                <td><RequirementBadge status={r.status} /></td>
                <td className="text-sm">{r.detail ?? '—'}</td>
                <td>{fmtDate(r.evidence_date)}</td>
                <td>{fmtDate(r.expires_on)}</td>
                <td>{fmtDate(r.required_by)}</td>
                <td className="text-sm">{sourcesText(r, names)}</td>
                {canAssign && (
                  <td>
                    {assignable(r) && (
                      <AssignLearningButton companyId={companyId} personId={personId}
                        kind={r.type as 'training' | 'competency'} referenceId={r.reference_id!} requirementName={r.name ?? 'requirement'} />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ─── Employment ─────────────────────────────────────────────────────

function Employment({ data, names }: { data: ProfileData; names: Names }) {
  const p = data.person!;
  return (
    <Card title="Employment">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Meta label="Lifecycle" value={p.lifecycle_status ? LIFECYCLE_LABELS[p.lifecycle_status as LifecycleStatus] ?? p.lifecycle_status : '—'} />
        <Meta label="Worker type" value={WORKER_TYPE_LABELS[p.worker_type] ?? p.worker_type} />
        <Meta label="Engagement" value={p.engagement_type ? ENGAGEMENT_LABELS[p.engagement_type as EngagementType] ?? p.engagement_type : '—'} />
        <Meta label="Contractor company" value={p.contractor_company || '—'} />
        <Meta label="Employee number" value={p.employee_number || '—'} />
        <Meta label="Work email" value={p.email || '—'} />
        <Meta label="Start date" value={fmtDate(p.start_date)} />
        <Meta label="End date" value={fmtDate(p.end_date)} />
        <Meta label="Manager" value={data.managerName ?? (p.manager_id ? 'Not visible to you' : '—')} />
        <Meta label="Site" value={p.site_id ? names.sites[p.site_id] ?? '—' : '—'} />
        <Meta label="Department" value={p.department_id ? names.departments[p.department_id] ?? '—' : '—'} />
        <Meta label="Primary role" value={p.primary_role_id ? names.roles[p.primary_role_id] ?? '—' : '—'} />
      </dl>
    </Card>
  );
}

// ─── Roles ──────────────────────────────────────────────────────────

function RolesTab({ data, names, companyId, manage, canPreview, sites, departments }: {
  data: ProfileData; names: Names; companyId: string; manage: boolean; canPreview: boolean; sites: SiteOption[]; departments: DepartmentOption[];
}) {
  const p = data.person!;
  const activeRoles = data.catalogue.roles.filter(r => r.active_status === 'active')
    .map(r => ({ id: r.id, title: r.title, safety_critical: r.safety_critical }));
  return (
    <Card title="Roles">
      {data.assignments.length === 0 ? <Empty>No roles assigned. Assign a role so its requirements apply.</Empty> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">Role</th><th scope="col">Site</th><th scope="col">Department</th><th scope="col">Primary</th><th scope="col">Status</th><th scope="col">Dates</th>{manage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {data.assignments.map(a => (
                <tr key={a.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>{names.roles[a.role_id] ?? 'Role'}</th>
                  <td>{a.site_id ? names.sites[a.site_id] ?? '—' : '—'}</td>
                  <td>{a.department_id ? names.departments[a.department_id] ?? '—' : '—'}</td>
                  <td>{yesNo(a.primary_assignment)}</td>
                  <td><Pill tone={a.assignment_status === 'active' ? 'good' : a.assignment_status === 'planned' ? 'info' : 'muted'}>{a.assignment_status === 'active' ? 'Active' : a.assignment_status === 'planned' ? 'Planned' : 'Ended'}</Pill>
                    {a.ended_reason && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{a.ended_reason}</div>}</td>
                  <td>{fmtDate(a.start_date)} – {a.end_date ? fmtDate(a.end_date) : 'ongoing'}</td>
                  {manage && <td>{a.assignment_status !== 'ended' && <EndAssignmentButton assignmentId={a.id} startDate={a.start_date} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canPreview && activeRoles.length > 0 && <RolePreview personId={p.id} roles={activeRoles} />}
      {manage && <AssignRoleForm companyId={companyId} personId={p.id} roles={activeRoles} sites={sites} departments={departments} />}
    </Card>
  );
}

// ─── Training ───────────────────────────────────────────────────────

function TrainingTab({ data, urls, companyId, isMe, today, canRecord, canVerify }: {
  data: ProfileData; urls: Record<string, string>; companyId: string; isMe: boolean; today: string; canRecord: boolean; canVerify: boolean;
}) {
  const courses = data.catalogue.courses.filter(c => c.active_status === 'active');
  return (
    <Card title="Training">
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Training shows what was attended or passed. It never makes someone competent on its own.</p>
      {data.training.length === 0 ? <Empty>No training recorded yet.{canRecord ? ' Record the first course below.' : ''}</Empty> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">Course</th><th scope="col">Completed</th><th scope="col">Result</th><th scope="col">Expires</th><th scope="col">Provider / certificate</th><th scope="col">Evidence</th><th scope="col">Verification</th>{canVerify && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {data.training.map(r => (
                <tr key={r.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>{r.course_name}</th>
                  <td>{fmtDate(r.completed_on)}</td>
                  <td>{r.result === 'pass' ? 'Passed' : r.result === 'fail' ? 'Failed' : 'Attended'}</td>
                  <td><Expiry date={r.expires_on} today={today} /></td>
                  <td className="text-sm">{[r.provider, r.certificate_number].filter(Boolean).join(' · ') || '—'}</td>
                  <td><EvidenceLink path={r.evidence_path} urls={urls} /></td>
                  <td><Verification status={r.verification_status} reason={r.rejection_reason} /></td>
                  {canVerify && <td>{r.verification_status === 'unverified' && <VerifyPair kind="training" id={r.id} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canVerify && <SafetyCriticalNote />}
      {canRecord && <RecordTrainingForm companyId={companyId} personId={data.person!.id} courses={courses.map(c => ({ id: c.id, title: c.title, validity_months: c.validity_months, safety_critical: c.safety_critical }))} />}
      {isMe && !canRecord && <Empty>To add your own certificate, use <Link href={`${WORKFORCE_BASE}/me`} className="underline">My workforce record</Link>.</Empty>}
    </Card>
  );
}

function VerifyPair({ kind, id }: { kind: 'training' | 'credential' | 'competency'; id: string }) {
  return (
    <span className="flex flex-wrap gap-1">
      <RpcAction rpc="workforce_verify" args={{ p_kind: kind, p_id: id, p_verdict: 'verified' }} label="Verify" tone="primary" done="Verified." />
      <RpcAction rpc="workforce_verify" args={{ p_kind: kind, p_id: id, p_verdict: 'rejected' }} label="Reject" reasonParam="p_reason"
        reasonLabel="Why is the evidence rejected?" tone="danger" done="Rejected." />
    </span>
  );
}

function SafetyCriticalNote() {
  return (
    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
      Safety-critical evidence can only be verified by a designated verifier, and never by the person who recorded it.
      The database checks this and will say so if it applies.
    </p>
  );
}

// ─── Competency ─────────────────────────────────────────────────────

function CompetencyTab({ data, urls, companyId, today, canAssess, canVerify }: {
  data: ProfileData; urls: Record<string, string>; companyId: string; today: string; canAssess: boolean; canVerify: boolean;
}) {
  const compNames = titles(data.catalogue.competencies);
  const levels = Object.fromEntries(data.catalogue.levels.map(l => [l.id, l.label])) as Record<string, string>;
  const groups = latestFirstBy(data.competencies, r => r.competency_id, r => `${r.assessed_on}|${r.created_at}`)
    .sort((a, b) => (compNames[a.key] ?? '').localeCompare(compNames[b.key] ?? ''));
  const suspendedOnly = [...new Set(data.suspensions.filter(s => !s.lifted_at).map(s => s.competency_id))]
    .filter(c => !groups.some(g => g.key === c));
  const activeComps = data.catalogue.competencies.filter(c => c.active_status === 'active');

  const row = (r: ProfileData['competencies'][number], history: boolean) => (
    <tr key={r.id} style={history ? { color: 'var(--ink-faint)' } : undefined}>
      <td>{history ? 'Earlier assessment' : <strong>{levels[r.level_id] ?? 'Level'}</strong>}{history ? ` — ${levels[r.level_id] ?? ''}` : ''}</td>
      <td>{fmtDate(r.assessed_on)}</td>
      <td>{ASSESSMENT_METHOD_LABELS[r.assessment_method as AssessmentMethod] ?? r.assessment_method}{r.assessor_name ? ` · ${r.assessor_name}` : ''}</td>
      <td><Expiry date={r.expires_on} today={today} /></td>
      <td><EvidenceLink path={r.evidence_path} urls={urls} /></td>
      <td><Verification status={r.verification_status} reason={r.rejection_reason} /></td>
      {canVerify && <td>{!history && r.verification_status === 'unverified' && <VerifyPair kind="competency" id={r.id} />}</td>}
    </tr>
  );

  return (
    <Card title="Competency">
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        A competency is met only by a verified assessment. Training and CVs are never treated as proof of competence.
      </p>
      {groups.length === 0 && suspendedOnly.length === 0 ? <Empty>No competency assessments recorded yet.</Empty> : (
        <div className="space-y-4">
          {groups.map(g => {
            const susp = openSuspension(data.suspensions.filter(s => s.competency_id === g.key));
            const past = data.suspensions.filter(s => s.competency_id === g.key && s.lifted_at);
            return (
              <div key={g.key} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium" style={{ color: 'var(--ink)' }}>{compNames[g.key] ?? 'Competency'}</h3>
                  {susp && <Pill tone="bad">Suspended</Pill>}
                  {canVerify && (susp
                    ? <RpcAction rpc="competency_reinstate" args={{ p_suspension: susp.id }} label="Reinstate" reasonParam="p_reason" reasonLabel="Why is it reinstated?" done="Reinstated." />
                    : <RpcAction rpc="competency_suspend" args={{ p_person: data.person!.id, p_competency: g.key }} label="Suspend" reasonParam="p_reason" reasonLabel="Why is it suspended?" tone="danger" done="Suspended. Safe to Deploy reflects this now." />)}
                </div>
                {susp && <p className="text-sm" style={{ color: 'var(--red)' }}>Suspended {fmtDate(susp.suspended_at)}: {susp.reason}</p>}
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th scope="col">Level</th><th scope="col">Assessed</th><th scope="col">Method / assessor</th><th scope="col">Expires</th><th scope="col">Evidence</th><th scope="col">Verification</th>{canVerify && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
                    <tbody>
                      {row(g.latest, false)}
                      {g.history.map(h => row(h, true))}
                    </tbody>
                  </table>
                </div>
                {past.length > 0 && (
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    Earlier suspensions: {past.map(s => `${fmtDate(s.suspended_at)} – ${fmtDate(s.lifted_at)} (${s.reason})`).join('; ')}
                  </p>
                )}
              </div>
            );
          })}
          {suspendedOnly.map(cid => {
            const susp = openSuspension(data.suspensions.filter(s => s.competency_id === cid))!;
            return (
              <div key={cid} className="flex flex-wrap items-center gap-2 text-sm">
                <strong>{compNames[cid] ?? 'Competency'}</strong> <Pill tone="bad">Suspended</Pill> {susp.reason}
                {canVerify && <RpcAction rpc="competency_reinstate" args={{ p_suspension: susp.id }} label="Reinstate" reasonParam="p_reason" done="Reinstated." />}
              </div>
            );
          })}
        </div>
      )}
      {canVerify && <SafetyCriticalNote />}
      {canAssess && (
        <RecordCompetencyForm companyId={companyId} personId={data.person!.id}
          competencies={activeComps.map(c => ({ id: c.id, title: c.title, safety_critical: c.safety_critical, assessment_method: c.assessment_method, renewal_months: c.renewal_months }))}
          levels={data.catalogue.levels} />
      )}
    </Card>
  );
}

// ─── Qualifications & licences ──────────────────────────────────────

function CredentialsTab({ data, urls, companyId, today, canAdd, canVerify }: {
  data: ProfileData; urls: Record<string, string>; companyId: string; today: string; canAdd: boolean; canVerify: boolean;
}) {
  const types = Object.fromEntries(data.catalogue.credentialTypes.map(t => [t.id, t])) as Record<string, ProfileData['catalogue']['credentialTypes'][number]>;
  return (
    <Card title="Qualifications & licences">
      {data.credentials.length === 0 ? <Empty>No qualifications, certificates, licences, cards or permits recorded.</Empty> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Number / awarding body</th><th scope="col">Issued</th><th scope="col">Expires</th><th scope="col">Evidence</th><th scope="col">Verification</th>{canVerify && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {data.credentials.map(c => {
                const t = types[c.credential_type_id];
                return (
                  <tr key={c.id}>
                    <th scope="row" style={{ fontWeight: 500 }}>{t?.title ?? 'Credential'}</th>
                    <td>{t ? typeLabel(t.kind) : '—'}</td>
                    <td className="text-sm">{[c.credential_number, c.awarding_body].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{fmtDate(c.issued_on)}</td>
                    <td><Expiry date={c.expires_on} today={today} /></td>
                    <td><EvidenceLink path={c.evidence_path} urls={urls} /></td>
                    <td><Verification status={c.verification_status} reason={c.rejection_reason} /></td>
                    {canVerify && <td>{c.verification_status === 'unverified' && <VerifyPair kind="credential" id={c.id} />}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canVerify && <SafetyCriticalNote />}
      {canAdd && (
        <AddCredentialForm companyId={companyId} personId={data.person!.id}
          types={data.catalogue.credentialTypes.filter(t => t.active_status === 'active')
            .map(t => ({ id: t.id, title: t.title, kind: t.kind, awarding_body: t.awarding_body, validity_months: t.validity_months }))} />
      )}
    </Card>
  );
}

// ─── Inductions ─────────────────────────────────────────────────────

function InductionsTab({ data, urls }: { data: ProfileData; urls: Record<string, string> }) {
  const t = titles(data.catalogue.inductions);
  return (
    <>
      <Card title="Inductions assigned">
        {data.inductionAssignments.length === 0 ? <Empty>No inductions assigned.</Empty> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Induction</th><th scope="col">Assigned</th><th scope="col">Required before</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {data.inductionAssignments.map(a => (
                  <tr key={a.id}>
                    <th scope="row" style={{ fontWeight: 500 }}>{t[a.induction_template_id] ?? 'Induction'}</th>
                    <td>{fmtDate(a.assigned_on)}</td>
                    <td>{fmtDate(a.required_before)}</td>
                    <td><Pill tone={a.status === 'completed' ? 'good' : a.status === 'cancelled' ? 'muted' : 'info'}>{a.status === 'completed' ? 'Completed' : a.status === 'cancelled' ? 'Cancelled' : 'Assigned'}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Inductions completed">
        {data.inductionCompletions.length === 0 ? <Empty>No inductions completed yet.</Empty> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Induction</th><th scope="col">Completed</th><th scope="col">Delivered by</th><th scope="col">Re-induction due</th><th scope="col">Evidence</th></tr></thead>
              <tbody>
                {data.inductionCompletions.map(c => (
                  <tr key={c.id}>
                    <th scope="row" style={{ fontWeight: 500 }}>{t[c.induction_template_id] ?? 'Induction'}</th>
                    <td>{fmtDate(c.completed_on)}</td>
                    <td>{c.delivered_by_name || '—'}</td>
                    <td>{fmtDate(c.reinduction_due)}</td>
                    <td><EvidenceLink path={c.evidence_path} urls={urls} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Authorisations & PPE ───────────────────────────────────────────

function AuthorisationsTab({ data, urls, names, companyId, today, sites, canIssue, canSuspend, canRevoke }: {
  data: ProfileData; urls: Record<string, string>; names: Names; companyId: string; today: string; sites: SiteOption[];
  canIssue: boolean; canSuspend: boolean; canRevoke: boolean;
}) {
  const t = titles(data.catalogue.authTypes);
  const ppeT = titles(data.catalogue.ppeTypes);
  const anyAction = canSuspend || canRevoke;
  return (
    <>
      <Card title="Authorisations">
        {data.authorisations.length === 0 ? <Empty>No authorisations issued.</Empty> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Authorisation</th><th scope="col">Scope</th><th scope="col">Issued</th><th scope="col">Expires</th><th scope="col">Evidence</th><th scope="col">State</th>{anyAction && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {data.authorisations.map(a => {
                  const susp = openSuspension(data.authSuspensions.filter(s => s.authorisation_id === a.id));
                  const revoked = a.status === 'revoked';
                  return (
                    <tr key={a.id}>
                      <th scope="row" style={{ fontWeight: 500 }}>{t[a.authorisation_type_id] ?? 'Authorisation'}</th>
                      <td className="text-sm">{[a.scope_site_id ? names.sites[a.scope_site_id] : 'Any site', a.scope_detail, a.issuing_authority].filter(Boolean).join(' · ')}</td>
                      <td>{fmtDate(a.issued_on)}</td>
                      <td><Expiry date={a.expires_on} today={today} /></td>
                      <td><EvidenceLink path={a.evidence_path} urls={urls} /></td>
                      <td>
                        {revoked ? <Pill tone="muted">Revoked</Pill> : susp ? <Pill tone="bad">Suspended</Pill> : <Pill tone="good">Active</Pill>}
                        {revoked && a.revoke_reason && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{a.revoke_reason}</div>}
                        {susp && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{susp.reason}</div>}
                      </td>
                      {anyAction && (
                        <td>
                          {!revoked && (
                            <span className="flex flex-wrap gap-1">
                              {canSuspend && (susp
                                ? <RpcAction rpc="authorisation_reinstate" args={{ p_suspension: susp.id }} label="Reinstate" reasonParam="p_reason" done="Reinstated." />
                                : <RpcAction rpc="authorisation_suspend" args={{ p_authorisation: a.id }} label="Suspend" reasonParam="p_reason" tone="danger" done="Suspended." />)}
                              {canRevoke && <RpcAction rpc="authorisation_revoke" args={{ p_authorisation: a.id }} label="Revoke" reasonParam="p_reason" tone="danger" done="Revoked." />}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canIssue && (
          <IssueAuthorisationForm companyId={companyId} personId={data.person!.id} sites={sites}
            types={data.catalogue.authTypes.filter(x => x.active_status === 'active').map(x => ({ id: x.id, title: x.title, validity_months: x.validity_months, safety_critical: x.safety_critical }))} />
        )}
      </Card>
      <Card title="PPE issued">
        {data.ppe.length === 0 ? <Empty>No PPE issues recorded.</Empty> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Item</th><th scope="col">Issued</th><th scope="col">Replacement due</th><th scope="col">Size / serial</th><th scope="col">Returned</th></tr></thead>
              <tbody>
                {data.ppe.map(i => (
                  <tr key={i.id}>
                    <th scope="row" style={{ fontWeight: 500 }}>{ppeT[i.ppe_type_id] ?? 'PPE'}</th>
                    <td>{fmtDate(i.issued_on)}</td>
                    <td>{fmtDate(i.replacement_due)}</td>
                    <td>{[i.size, i.serial_number].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{fmtDate(i.returned_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Pre-employment ─────────────────────────────────────────────────

function PreEmploymentTab({ data, urls, canDecide, canWaive }: { data: ProfileData; urls: Record<string, string>; canDecide: boolean; canWaive: boolean }) {
  const t = titles(data.catalogue.checkTypes);
  const decided = (s: string) => ['verified', 'failed', 'waived'].includes(s);
  return (
    <Card title="Pre-employment checks">
      {data.checks.length === 0 ? <Empty>No pre-employment checks recorded for this person.</Empty> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">Check</th><th scope="col">Status</th><th scope="col">Requested</th><th scope="col">Received</th><th scope="col">Evidence</th><th scope="col">Decision</th>{(canDecide || canWaive) && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {data.checks.map(c => (
                <tr key={c.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>{t[c.check_type_id] ?? 'Check'}</th>
                  <td><Pill tone={c.status === 'verified' ? 'good' : c.status === 'failed' ? 'bad' : c.status === 'waived' ? 'warn' : 'info'}>{CHECK_STATUS_LABELS[c.status as CheckStatus] ?? c.status}</Pill></td>
                  <td>{fmtDate(c.requested_on)}</td>
                  <td>{fmtDate(c.received_on)}</td>
                  <td><EvidenceLink path={c.evidence_path} urls={urls} /></td>
                  <td className="text-sm">{c.verified_at ? `${fmtDate(c.verified_at)}${c.decision_reason ? ` · ${c.decision_reason}` : ''}` : '—'}</td>
                  {(canDecide || canWaive) && (
                    <td>
                      {!decided(c.status) && (
                        <span className="flex flex-wrap gap-1">
                          {canDecide && <RpcAction rpc="pre_employment_check_decide" args={{ p_id: c.id, p_decision: 'verified', p_reason: null }} label="Verify" tone="primary" done="Verified." />}
                          {canDecide && <RpcAction rpc="pre_employment_check_decide" args={{ p_id: c.id, p_decision: 'failed' }} label="Fail" reasonParam="p_reason" reasonMin={10} reasonLabel="Why did the check fail?" tone="danger" done="Recorded as failed." />}
                          {canWaive && <RpcAction rpc="pre_employment_check_decide" args={{ p_id: c.id, p_decision: 'waived' }} label="Waive" reasonParam="p_reason" reasonMin={10} reasonLabel="Why is the check waived?" done="Waived." />}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>A failed or incomplete mandatory check keeps the person from being Ready. A decided check is never edited.</p>
    </Card>
  );
}

// ─── Occupational health (outcomes only; never clinical) ────────────

function HealthTab({ data }: { data: ProfileData }) {
  const reqT = titles(data.catalogue.ohRequirements);
  return (
    <Card title="Occupational health">
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Outcomes only — fitness category, dates and any operational restriction. Clinical notes and documents are never shown here.
      </p>
      {data.health.length === 0 ? <Empty>No occupational health outcomes recorded.</Empty> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">Assessment</th><th scope="col">Outcome</th><th scope="col">Assessed</th><th scope="col">Provider</th><th scope="col">Review</th><th scope="col">Restriction</th></tr></thead>
            <tbody>
              {data.health.map(h => (
                <tr key={h.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>{h.requirement_id ? reqT[h.requirement_id] ?? 'Assessment' : 'General assessment'}</th>
                  <td><Pill tone={h.outcome === 'fit' ? 'good' : h.outcome === 'fit_with_restrictions' || h.outcome === 'further_assessment_required' ? 'warn' : 'bad'}>{HEALTH_OUTCOME_LABELS[h.outcome as HealthOutcome] ?? h.outcome}</Pill></td>
                  <td>{fmtDate(h.assessed_on)}</td>
                  <td>{h.provider || '—'}</td>
                  <td>{fmtDate(h.review_date)}</td>
                  <td className="text-sm">{h.restriction_summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Development ────────────────────────────────────────────────────

function DevelopmentTab({ data, companyId, canAdd }: { data: ProfileData; companyId: string; canAdd: boolean }) {
  const c = titles(data.catalogue.courses);
  const k = titles(data.catalogue.competencies);
  const statusLabel: Record<string, string> = { open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' };
  return (
    <Card title="Development">
      {data.development.length === 0 ? <Empty>No development items.{canAdd ? ' Add one below.' : ''}</Empty> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">Item</th><th scope="col">Linked to</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {data.development.map(d => (
                <tr key={d.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>{d.title}</th>
                  <td className="text-sm">{[d.linked_course_id ? `Course: ${c[d.linked_course_id] ?? '—'}` : null, d.linked_competency_id ? `Competency: ${k[d.linked_competency_id] ?? '—'}` : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{fmtDate(d.due_date)}</td>
                  <td><Pill tone={toneFor(d.status)}>{statusLabel[d.status] ?? d.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canAdd && (
        <AddDevelopmentForm companyId={companyId} personId={data.person!.id}
          courses={data.catalogue.courses.filter(x => x.active_status === 'active').map(x => ({ id: x.id, title: x.title }))}
          competencies={data.catalogue.competencies.filter(x => x.active_status === 'active').map(x => ({ id: x.id, title: x.title }))} />
      )}
    </Card>
  );
}

// ─── Safety activity (incident number and status only) ──────────────

function SafetyTab({ data }: { data: ProfileData }) {
  return (
    <Card title="Safety activity">
      {data.incidents.length === 0 ? <Empty>This person is not named on any incident you can see.</Empty> : (
        <ul className="text-sm space-y-1">
          {data.incidents.map(i => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <Link href={`/protect/incidents/${i.id}`} className="underline">{i.incident_number ?? 'Incident'}</Link>
              <span style={{ color: 'var(--ink-faint)' }}>{fmtDate(i.occurred_on)}</span>
              <Pill tone={toneFor(i.status)}>{i.status.replace(/_/g, ' ')}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── History ────────────────────────────────────────────────────────

function HistoryTab({ data }: { data: ProfileData }) {
  const items = historyItems(data.log);
  return (
    <Card title="Safe to Deploy history">
      {items.length === 0 ? <Empty>No status changes recorded yet.</Empty> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th scope="col">When</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Because</th></tr></thead>
            <tbody>
              {items.map(h => (
                <tr key={h.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>{fmtDateTime(h.when)}</th>
                  <td>{h.from}</td>
                  <td>{h.toStatus ? <DeploymentBadge status={h.toStatus} size="sm" /> : h.to}</td>
                  <td className="text-sm">{h.reasons.length ? h.reasons.join('; ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        To check a past date, use “Status as of” on the Overview. Current labels: {Object.values(DEPLOYMENT_STATUS_LABELS).join(', ')}.
      </p>
    </Card>
  );
}
