import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgSitesAndDepartments, param, todayIso, fmtDate } from '@/lib/hs/safetyContext';
import { WORKFORCE_BASE, workforcePersonPath, workforceRolePath, type RoleStatus } from '@/lib/workforce/vocab';
import { RULE_COLUMNS, groupRules, type RuleRow } from '@/lib/workforce/requirements';
import Pill, { type Tone } from '@/components/safety/Pill';
import RequirementsEditor from '../RequirementsEditor';
import { EditRoleForm, RoleActions } from '../RolesClient';
import { loadRuleCatalogues } from '../loadCatalogues';

export const metadata: Metadata = { title: 'Role requirements' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<RoleStatus, string> = { draft: 'Draft', active: 'Active', inactive: 'Inactive' };
const STATUS_TONE: Record<RoleStatus, Tone> = { draft: 'warn', active: 'good', inactive: 'muted' };

interface Role {
  id: string; title: string; description: string | null; role_category: string | null; safety_critical: boolean;
  active_status: RoleStatus; department_id: string | null; default_site_id: string | null; cloned_from_id: string | null;
}

// One role and its requirements (spec 6, 9, 104, 105). The requirement
// editor is shared with the site requirements on the Catalogue page.
export default async function RolePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  const today = todayIso();

  const [roleRes, rulesRes, cat, { sites, departments }, asgRes] = await Promise.all([
    supabase.from('job_roles')
      .select('id, title, description, role_category, safety_critical, active_status, department_id, default_site_id, cloned_from_id')
      .eq('id', id).eq('company_id', companyId).maybeSingle(),
    supabase.from('role_requirements').select(RULE_COLUMNS).eq('role_id', id).eq('company_id', companyId)
      .order('created_at').limit(500),
    loadRuleCatalogues(supabase, companyId),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('role_assignments').select('id, person_id, site_id, primary_assignment, start_date, end_date')
      .eq('role_id', id).eq('company_id', companyId).eq('assignment_status', 'active').order('start_date').limit(500),
  ]);
  const role = roleRes.data as Role | null;
  if (!role) notFound();
  const rules = (rulesRes.data ?? []) as RuleRow[];
  const assignments = (asgRes.data ?? []) as { id: string; person_id: string; site_id: string | null; primary_assignment: boolean; start_date: string; end_date: string | null }[];

  const personIds = [...new Set(assignments.map(a => a.person_id))];
  const [peopleRes, clonedRes] = await Promise.all([
    personIds.length
      ? supabase.from('people').select('id, full_name').in('id', personIds).limit(500)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
    role.cloned_from_id
      ? supabase.from('job_roles').select('id, title').eq('id', role.cloned_from_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const personName = new Map(((peopleRes.data ?? []) as { id: string; full_name: string }[]).map(p => [p.id, p.full_name]));
  const clonedFrom = clonedRes.data as { id: string; title: string } | null;
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const deptName = new Map(departments.map(d => [d.id, d.name]));
  const manage = ctx.can('workforce.manage');
  const drafts = groupRules(rules, today).draft.length;
  const justCloned = param(sp, 'cloned') === '1';

  return (
    <main className="portal-page flex-1 space-y-4">
      <nav aria-label="Back"><Link href={`${WORKFORCE_BASE}/roles`} className="text-sm" style={{ color: 'var(--ink-soft)' }}>← All roles</Link></nav>

      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-[220px]">
            <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>{role.title}</h1>
            {role.role_category && <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{role.role_category}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone={STATUS_TONE[role.active_status]}>{STATUS_LABEL[role.active_status]}</Pill>
            {role.safety_critical && <Pill tone="bad">Safety-critical role</Pill>}
          </div>
        </div>
        <dl className="grid gap-2 grid-cols-1 sm:grid-cols-3 text-sm">
          <div><dt className="label">Department</dt><dd>{role.department_id ? deptName.get(role.department_id) ?? '—' : 'Not set'}</dd></div>
          <div><dt className="label">Default site</dt><dd>{role.default_site_id ? siteName.get(role.default_site_id) ?? '—' : 'Not set'}</dd></div>
          <div><dt className="label">Copied from</dt><dd>{clonedFrom ? <Link href={workforceRolePath(clonedFrom.id)}>{clonedFrom.title}</Link> : '—'}</dd></div>
        </dl>
        {role.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{role.description}</p>}
        {role.safety_critical && (
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Because this role is safety-critical, every mandatory requirement on it is treated as safety-critical by Safe to Deploy.
          </p>
        )}
        {role.active_status === 'draft' && (
          <p role="status" className="text-sm p-3 rounded-lg" style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)' }}>
            {justCloned ? 'This role is a copy. ' : ''}This is a draft role: its {drafts} draft requirement{drafts === 1 ? '' : 's'} apply to
            no one yet. Review them below, then activate the role to bring them into force.
          </p>
        )}
        {role.active_status === 'inactive' && (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            This role is inactive. People still assigned to it must still meet its requirements until their assignment ends.
          </p>
        )}
        {manage && (
          <div className="flex flex-wrap items-start gap-3 no-print">
            <EditRoleForm role={{
              id: role.id, title: role.title, description: role.description ?? '', role_category: role.role_category ?? '',
              safety_critical: role.safety_critical, department_id: role.department_id ?? '', default_site_id: role.default_site_id ?? '',
            }} sites={sites} departments={departments} />
            <RoleActions role={role} today={today} draftCount={drafts} assignedCount={assignments.length} />
          </div>
        )}
      </section>

      {(rulesRes.error || cat.error) && (
        <p role="alert" className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Some requirements or catalogue items could not be loaded. Refresh to try again.</p>
      )}

      <RequirementsEditor table="role_requirements" scopeId={role.id} companyId={companyId} rules={rules} byTable={cat.byTable}
        levels={cat.levels} canManage={manage} today={today} scopeNoun="role" />

      <section className="card p-5 space-y-3" aria-labelledby="people-on-role">
        <h2 id="people-on-role" className="font-semibold" style={{ color: 'var(--ink)' }}>People on this role ({assignments.length})</h2>
        {asgRes.error && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>Assignments could not be loaded.</p>}
        {assignments.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Nobody you can see is assigned to this role. Assign people from their profile in Workforce.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Person</th><th scope="col">Site</th><th scope="col">Primary role</th><th scope="col">Since</th><th scope="col">Until</th></tr></thead>
              <tbody>
                {assignments.map(a => (
                  <tr key={a.id}>
                    <td><Link href={workforcePersonPath(a.person_id)} style={{ color: 'var(--ink)' }}>{personName.get(a.person_id) ?? 'Person'}</Link></td>
                    <td>{a.site_id ? siteName.get(a.site_id) ?? '—' : '—'}</td>
                    <td>{a.primary_assignment ? 'Yes' : 'No'}</td>
                    <td className="whitespace-nowrap">{fmtDate(a.start_date)}</td>
                    <td className="whitespace-nowrap">{a.end_date ? fmtDate(a.end_date) : 'Open-ended'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Shows only the people you are allowed to see.</p>
      </section>
    </main>
  );
}
