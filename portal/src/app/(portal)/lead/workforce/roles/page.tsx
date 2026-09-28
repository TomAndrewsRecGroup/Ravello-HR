import type { Metadata } from 'next';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgSitesAndDepartments, param, todayIso } from '@/lib/hs/safetyContext';
import { readAllPages } from '@/lib/supabase/paged';
import { ROLE_STATUSES, workforceRolePath, type RoleStatus } from '@/lib/workforce/vocab';
import FilterForm from '@/components/safety/FilterForm';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import Pill, { type Tone } from '@/components/safety/Pill';
import { CreateRoleForm, RoleActions } from './RolesClient';

export const metadata: Metadata = { title: 'Roles' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;
const STATUS_LABEL: Record<RoleStatus, string> = { draft: 'Draft', active: 'Active', inactive: 'Inactive' };
const STATUS_TONE: Record<RoleStatus, Tone> = { draft: 'warn', active: 'good', inactive: 'muted' };

interface RoleRow {
  id: string; title: string; active_status: RoleStatus; safety_critical: boolean; role_category: string | null;
  department_id: string | null; default_site_id: string | null; cloned_from_id: string | null;
}

// Job roles: the operational requirements a person takes on, not a job
// title (spec 6). Anyone who can read the workforce sees the list;
// creating, cloning and activating need workforce.manage (RLS decides).
export default async function RolesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const today = todayIso();
  const f = { status: param(sp, 'status'), q: param(sp, 'q'), sc: param(sp, 'sc') };
  let q = supabase.from('job_roles')
    .select('id, title, active_status, safety_critical, role_category, department_id, default_site_id, cloned_from_id', { count: 'exact' })
    .eq('company_id', companyId);
  if (f.status && (ROLE_STATUSES as readonly string[]).includes(f.status)) q = q.eq('active_status', f.status);
  if (f.sc === '1') q = q.eq('safety_critical', true);
  if (f.q) q = q.ilike('title', `%${f.q.replace(/[%_\\,()]/g, ' ')}%`);

  const [{ data, count, error }, { sites, departments }, rules, assigned] = await Promise.all([
    q.order('title').limit(LIMIT),
    orgSitesAndDepartments(supabase, companyId),
    readAllPages<{ role_id: string; effective_from: string | null; effective_until: string | null }>((from, to) =>
      supabase.from('role_requirements').select('id, role_id, effective_from, effective_until')
        .eq('company_id', companyId).or(`effective_from.is.null,effective_until.is.null,effective_until.gte.${today}`)
        .order('id').range(from, to)),
    readAllPages<{ role_id: string }>((from, to) =>
      supabase.from('role_assignments').select('id, role_id').eq('company_id', companyId).eq('assignment_status', 'active')
        .order('id').range(from, to)),
  ]);
  const roles = (data ?? []) as RoleRow[];
  const inForce = new Map<string, number>();
  const drafts = new Map<string, number>();
  for (const r of rules.rows) {
    if (!r.effective_from) drafts.set(r.role_id, (drafts.get(r.role_id) ?? 0) + 1);
    else if (r.effective_from <= today && (!r.effective_until || r.effective_until >= today)) inForce.set(r.role_id, (inForce.get(r.role_id) ?? 0) + 1);
  }
  const people = new Map<string, number>();
  for (const a of assigned.rows) people.set(a.role_id, (people.get(a.role_id) ?? 0) + 1);
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const deptName = new Map(departments.map(d => [d.id, d.name]));
  const manage = ctx.can('workforce.manage');

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <p className="text-sm flex-1 min-w-[240px]" style={{ color: 'var(--ink-soft)' }}>
          A role is the set of requirements a person must meet to do a job safely: training, competencies, qualifications,
          occupational health, inductions, authorisations and PPE.
        </p>
        {manage && <CreateRoleForm companyId={companyId} sites={sites} departments={departments} />}
      </div>

      <FilterForm fields={[
        { name: 'q', label: 'Search', type: 'search', value: f.q },
        { name: 'status', label: 'Status', value: f.status, options: ROLE_STATUSES.map(s => ({ value: s, label: STATUS_LABEL[s] })) },
        { name: 'sc', label: 'Safety-critical only', type: 'checkbox', value: f.sc },
      ]} />

      {(error || rules.error || assigned.error) && (
        <p role="alert" className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Some role information could not be loaded. Refresh to try again.</p>
      )}
      {(rules.truncated || assigned.truncated) && (
        <p className="text-xs" style={{ color: 'var(--gold)' }}>Counts are incomplete: there are more rows than can be counted on one page.</p>
      )}
      {(count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing the first {LIMIT} of {count} roles. Narrow the filters to see the rest.</p>}

      {roles.length === 0 ? (
        <SafetyEmpty icon={Briefcase} title="No roles yet"
          text={Object.values(f).some(Boolean) ? 'Nothing matches these filters.'
            : manage ? 'Create a role, then add the requirements someone needs to do it safely.' : 'Someone with workforce management access can create roles.'} />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <caption className="sr-only">Job roles</caption>
            <thead>
              <tr>
                <th scope="col">Role</th><th scope="col">Status</th><th scope="col">Safety-critical</th><th scope="col">Department</th>
                <th scope="col">Default site</th><th scope="col">Requirements in force</th><th scope="col">People assigned</th>
                {manage && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id}>
                  <td>
                    <Link href={workforceRolePath(r.id)} style={{ color: 'var(--ink)' }} className="font-medium">{r.title}</Link>
                    {r.role_category && <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{r.role_category}</span>}
                  </td>
                  <td><Pill tone={STATUS_TONE[r.active_status]}>{STATUS_LABEL[r.active_status]}</Pill></td>
                  <td>{r.safety_critical ? <Pill tone="bad">Safety-critical</Pill> : 'No'}</td>
                  <td>{r.department_id ? deptName.get(r.department_id) ?? '—' : '—'}</td>
                  <td>{r.default_site_id ? siteName.get(r.default_site_id) ?? '—' : '—'}</td>
                  <td>
                    {inForce.get(r.id) ?? 0}
                    {(drafts.get(r.id) ?? 0) > 0 && <span className="block text-xs" style={{ color: 'var(--gold)' }}>{drafts.get(r.id)} draft</span>}
                  </td>
                  <td>{people.get(r.id) ?? 0}</td>
                  {manage && (
                    <td className="min-w-[200px]">
                      <RoleActions role={r} today={today} draftCount={drafts.get(r.id) ?? 0} assignedCount={people.get(r.id) ?? 0} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>People assigned counts only the people you are allowed to see.</p>
    </main>
  );
}
