import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Upload, CalendarClock } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgSitesAndDepartments, param, fmtDateTime } from '@/lib/hs/safetyContext';
import {
  DEPLOYMENT_STATUSES, DEPLOYMENT_STATUS_LABELS, DEPLOYMENT_STATUS_COLOURS, ENGAGEMENT_TYPES, ENGAGEMENT_LABELS,
  WORKER_TYPE_LABELS, workforcePersonPath, type DeploymentStatus, type EngagementType,
} from '@/lib/workforce/vocab';
import type { MatrixRow } from '@/lib/workforce/types';
import { filterMatrix, matrixCsvRows, summariseMatrix, WORKFORCE_CSV_COLUMNS, type Count } from '@/lib/workforce/dashboard';
import { DeploymentBadge } from '@/components/workforce/DeploymentBadge';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';

export const metadata: Metadata = { title: 'Safe to Deploy' };
export const dynamic = 'force-dynamic';

/** The worker types the engine calculates (138 workforce_matrix). */
const MATRIX_WORKER_TYPES = ['employee', 'contractor', 'consultant', 'temporary_worker'] as const;

// Safe to Deploy (spec 30-35, 49, 76, 102). Every status, reason and
// requirement state on this page is the database engine's own answer
// (138 workforce_matrix, one call). The page only counts and filters
// what it returned — no score, no prediction, nothing recalculated.
//
// workforce_matrix returns only the people the viewer may see
// (person_visible): a workforce.read holder gets the organisation, a
// site / department / line manager gets their team. So this page is the
// manager's team view too.
export default async function SafeToDeployPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const f = {
    q: param(sp, 'q'), status: param(sp, 'status'), site: param(sp, 'site'), department: param(sp, 'department'),
    role: param(sp, 'role'), workerType: param(sp, 'worker_type'), engagement: param(sp, 'engagement'),
    scGap: param(sp, 'sc_gap') === '1', expiring: param(sp, 'expiring') === '1',
  };

  const [matrix, roles, { sites, departments }] = await Promise.all([
    supabase.rpc('workforce_matrix', { p_company: companyId }),
    supabase.from('job_roles').select('id, title').eq('company_id', companyId).order('title').limit(500),
    orgSitesAndDepartments(supabase, companyId),
  ]);

  const all = (matrix.data ?? []) as MatrixRow[];
  const rows = filterMatrix(all, f);
  const summary = summariseMatrix(rows);
  const names = {
    roles: new Map((roles.data ?? []).map(r => [r.id as string, r.title as string])),
    sites: new Map(sites.map(s => [s.id, s.name])),
    departments: new Map(departments.map(d => [d.id, d.name])),
  };
  const orgWide = ctx.can('workforce.read');
  const canImport = ctx.can('workforce.manage') || ctx.can('training.manage');
  const filtered = Object.entries(f).some(([, v]) => Boolean(v));

  const statusCards: { status: DeploymentStatus; n: number }[] = DEPLOYMENT_STATUSES.map(s => ({ status: s, n: summary.byStatus[s] }));
  const reqCards: { label: string; c: Count; hint: string }[] = [
    { label: 'Training expired or not completed', c: summary.trainingUnmet, hint: 'Required training with no valid record' },
    { label: 'Expiring soon', c: summary.expiringSoon, hint: 'Evidence inside its reminder window' },
    { label: 'Competency missing', c: summary.competencyMissing, hint: 'No verified assessment at the required level' },
    { label: 'Documents and credentials missing', c: summary.documentsMissing, hint: 'Qualifications, licences, cards, permits, documents' },
    { label: 'Induction not completed', c: summary.inductionIncomplete, hint: 'Required inductions not yet recorded' },
    { label: 'Occupational health reviews due', c: summary.healthReviewsDue, hint: 'Surveillance not current or due soon' },
    { label: 'Awaiting verification', c: summary.awaitingVerification, hint: 'Evidence submitted, not yet verified' },
  ];

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {orgWide
            ? 'Everyone in this organisation who is due to work, and whether their evidence says they are safe to deploy today.'
            : 'Your team: the people you manage directly or through a site or department.'}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <CsvButton filename="safe-to-deploy.csv" rows={matrixCsvRows(rows, names)} columns={WORKFORCE_CSV_COLUMNS} />
          <Link href="/lead/workforce/exceptions" className="btn-secondary btn-sm" style={{ minHeight: 40 }}>
            <CalendarClock size={14} /> Exceptions
          </Link>
          {canImport && (
            <Link href="/lead/workforce/import" className="btn-secondary btn-sm" style={{ minHeight: 40 }}>
              <Upload size={14} /> Import
            </Link>
          )}
        </div>
      </div>

      {matrix.error && (
        <p className="card p-3 text-sm" role="alert" style={{ color: 'var(--red)' }}>
          Safe to Deploy could not be loaded: {matrix.error.message}
        </p>
      )}

      <section aria-labelledby="std-counts" className="space-y-3">
        <h2 id="std-counts" className="sr-only">Counts{filtered ? ' for the filtered list' : ''}</h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="card p-4">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Workers</p>
            <p className="text-2xl font-semibold font-display" style={{ color: 'var(--ink)' }}>{summary.total}</p>
          </div>
          {statusCards.map(c => (
            <div key={c.status} className="card p-4" style={{ borderLeft: `4px solid ${DEPLOYMENT_STATUS_COLOURS[c.status]}` }}>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{DEPLOYMENT_STATUS_LABELS[c.status]}</p>
              <p className="text-2xl font-semibold font-display" style={{ color: 'var(--ink)' }}>{c.n}</p>
            </div>
          ))}
          <div className="card p-4" style={{ borderLeft: '4px solid var(--red)' }}>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Safety-critical gaps</p>
            <p className="text-2xl font-semibold font-display" style={{ color: 'var(--ink)' }}>{summary.safetyCriticalGap}</p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>people</p>
          </div>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {reqCards.map(c => (
            <div key={c.label} className="card p-4">
              <p className="text-xs font-medium" style={{ color: 'var(--ink-soft)' }}>{c.label}</p>
              <p className="text-xl font-semibold font-display" style={{ color: 'var(--ink)' }}>
                {c.c.items} <span className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>
                  requirement{c.c.items === 1 ? '' : 's'} · {c.c.people} {c.c.people === 1 ? 'person' : 'people'}
                </span>
              </p>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{c.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <FilterForm fields={[
        { name: 'q', label: 'Search name', type: 'search', value: f.q },
        { name: 'status', label: 'Status', value: f.status, options: DEPLOYMENT_STATUSES.map(s => ({ value: s, label: DEPLOYMENT_STATUS_LABELS[s] })) },
        { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
        { name: 'department', label: 'Department', value: f.department, options: departments.map(d => ({ value: d.id, label: d.name })) },
        { name: 'role', label: 'Role', value: f.role, options: (roles.data ?? []).map(r => ({ value: r.id as string, label: r.title as string })) },
        { name: 'worker_type', label: 'Worker type', value: f.workerType, options: MATRIX_WORKER_TYPES.map(w => ({ value: w, label: WORKER_TYPE_LABELS[w] ?? w })) },
        { name: 'engagement', label: 'Engagement', value: f.engagement, options: ENGAGEMENT_TYPES.map(e => ({ value: e, label: ENGAGEMENT_LABELS[e] })) },
        { name: 'sc_gap', label: 'Safety-critical gaps only', type: 'checkbox', value: f.scGap ? '1' : '' },
        { name: 'expiring', label: 'Expiring only', type: 'checkbox', value: f.expiring ? '1' : '' },
      ]} />

      {all.length === 0 && !matrix.error ? (
        <SafetyEmpty icon={ShieldCheck} title="No workers to show yet"
          text={orgWide
            ? 'People appear here once they are active (or starting) and have a role assignment. Set up a role with its requirements, then assign people to it.'
            : 'Nobody in your team is due to work yet. People appear here once they are assigned a role and you manage them.'}>
          <Link href="/lead/workforce/roles" className="btn-cta btn-sm">Go to Roles</Link>
        </SafetyEmpty>
      ) : rows.length === 0 && !matrix.error ? (
        <SafetyEmpty icon={ShieldCheck} title="Nobody matches these filters" text="Clear a filter to widen the list." />
      ) : rows.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <caption className="sr-only">Safe to Deploy status for each worker, with counts and the first reason</caption>
            <thead>
              <tr>
                <th scope="col">Name</th><th scope="col">Status</th><th scope="col">Role</th><th scope="col">Site</th>
                <th scope="col">Engagement</th><th scope="col">Not met</th><th scope="col">Awaiting verification</th>
                <th scope="col">Expiring</th><th scope="col">Main reason</th><th scope="col">Calculated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const res = r.result;
                const st = (res?.status && res.status in DEPLOYMENT_STATUS_LABELS ? res.status : 'REVIEW_REQUIRED') as DeploymentStatus;
                return (
                  <tr key={r.person_id}>
                    <th scope="row" style={{ fontWeight: 500 }}>
                      <Link href={workforcePersonPath(r.person_id)} style={{ color: 'var(--ink)' }}>{r.full_name}</Link>
                      {res?.summary?.safety_critical_gap && (
                        <span className="block text-xs" style={{ color: 'var(--red)' }}>Safety-critical gap</span>
                      )}
                    </th>
                    <td><DeploymentBadge status={st} size="sm" /></td>
                    <td>{r.primary_role_id ? names.roles.get(r.primary_role_id) ?? '—' : '—'}</td>
                    <td>{r.site_id ? names.sites.get(r.site_id) ?? '—' : '—'}</td>
                    <td>{r.engagement_type ? ENGAGEMENT_LABELS[r.engagement_type as EngagementType] ?? r.engagement_type : WORKER_TYPE_LABELS[r.worker_type] ?? r.worker_type}</td>
                    <td>{res?.summary?.unmet ?? 0}</td>
                    <td>{res?.summary?.review ?? 0}</td>
                    <td>{res?.summary?.expiring ?? 0}</td>
                    <td className="text-sm" style={{ color: 'var(--ink-soft)', minWidth: 200 }}>
                      {res?.reasons?.[0]?.text ?? (st === 'READY' ? 'Every requirement is met.' : '—')}
                      {(res?.reasons?.length ?? 0) > 1 && (
                        <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>+{res.reasons.length - 1} more</span>
                      )}
                    </td>
                    <td className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-faint)' }}>
                      {fmtDateTime(res?.computed_at)}
                      <span className="block">{res?.source === 'cache' ? 'Saved result' : 'Calculated now'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
