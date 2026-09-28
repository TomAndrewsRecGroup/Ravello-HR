import type { Metadata } from 'next';
import Link from 'next/link';
import { Grid3X3, Upload } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgSitesAndDepartments, param, fmtDate } from '@/lib/hs/safetyContext';
import { readAllPages } from '@/lib/supabase/paged';
import {
  ENGAGEMENT_LABELS, ENGAGEMENT_TYPES, REQUIREMENT_STATUSES, REQUIREMENT_STATUS_COLOURS, REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_TYPES, REQUIREMENT_TYPE_LABELS, workforcePersonPath,
} from '@/lib/workforce/vocab';
import type { MatrixRow } from '@/lib/workforce/types';
import {
  CELL_ABBREVIATIONS, MATRIX_CSV_COLUMNS, cellLabel, matrixCsvRows, personRequirements, pivotMatrix, showDate,
  type MatrixFilters,
} from '@/lib/workforce/matrix';
import FilterForm from '@/components/safety/FilterForm';
import CsvButton from '@/components/safety/CsvButton';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import { DeploymentBadge } from '@/components/workforce/DeploymentBadge';

export const metadata: Metadata = { title: 'Compliance matrix' };
export const dynamic = 'force-dynamic';

// The compliance matrix (spec 18, 119): every visible person against
// every requirement that applies to them, from ONE engine read
// (workforce_matrix, 138). Each cell is the engine's own status for
// that requirement — nothing is recalculated here. Who appears is
// person_visible (a manager sees their team, workforce.read everyone).
export default async function WorkforceMatrixPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const f: MatrixFilters = {
    site: param(sp, 'site'), department: param(sp, 'department'), role: param(sp, 'role'), manager: param(sp, 'manager'),
    worker: param(sp, 'worker'), type: param(sp, 'type'),
    expiring: param(sp, 'expiring') === '1', unmet: param(sp, 'unmet') === '1', safetyCritical: param(sp, 'sc') === '1',
  };

  const [matrix, { sites, departments }, roles, assignments] = await Promise.all([
    readAllPages<MatrixRow>((from, to) => supabase.rpc('workforce_matrix', { p_company: companyId })
      .order('full_name').order('person_id').range(from, to)),
    orgSitesAndDepartments(supabase, companyId),
    supabase.from('job_roles').select('id, title').eq('company_id', companyId).order('title').limit(500),
    readAllPages<{ id: string; person_id: string; role_id: string }>((from, to) => supabase.from('role_assignments')
      .select('id, person_id, role_id').eq('company_id', companyId).eq('assignment_status', 'active')
      .order('id').range(from, to)),
  ]);

  const all = matrix.rows;
  const byRole = new Map<string, string[]>();
  for (const a of assignments.rows) byRole.set(a.person_id, [...(byRole.get(a.person_id) ?? []), a.role_id]);

  // Managers: named from the matrix itself where visible; otherwise from people (RLS decides).
  const names = new Map(all.map(p => [p.person_id, p.full_name]));
  const managerIds = [...new Set(all.map(p => p.manager_id).filter((x): x is string => !!x))];
  const missing = managerIds.filter(id => !names.has(id));
  if (missing.length) {
    const { data } = await supabase.from('people').select('id, full_name').in('id', missing.slice(0, 500)).limit(500);
    for (const p of (data ?? []) as { id: string; full_name: string }[]) names.set(p.id, p.full_name);
  }

  const m = pivotMatrix(all, f, byRole);
  const canSeeHealth = ctx.can('occupational_health.summary.read');
  const csv = matrixCsvRows(m);
  const filtered = Object.values(f).some(Boolean);

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Each person against every requirement their roles, sites and individual rules set. The status in each cell is the
          Safe to Deploy engine&apos;s own judgement of the evidence.
        </p>
        <div className="ml-auto flex gap-2">
          <CsvButton filename="workforce-matrix.csv" rows={csv} columns={MATRIX_CSV_COLUMNS} />
          {(ctx.can('training.manage') || ctx.can('competency.assess')) && (
            <Link href="/lead/workforce/import" className="btn-secondary btn-sm"><Upload size={14} /> Import records</Link>
          )}
        </div>
      </div>

      <FilterForm fields={[
        { name: 'site', label: 'Site', value: f.site, options: sites.map(s => ({ value: s.id, label: s.name })) },
        { name: 'department', label: 'Department', value: f.department, options: departments.map(d => ({ value: d.id, label: d.name })) },
        { name: 'role', label: 'Role', value: f.role, options: ((roles.data ?? []) as { id: string; title: string }[]).map(r => ({ value: r.id, label: r.title })) },
        { name: 'manager', label: 'Manager', value: f.manager, options: managerIds.map(id => ({ value: id, label: names.get(id) ?? 'Manager not visible to you' }))
            .sort((a, b) => a.label.localeCompare(b.label)) },
        { name: 'worker', label: 'Worker type', value: f.worker, options: ENGAGEMENT_TYPES.map(t => ({ value: t, label: ENGAGEMENT_LABELS[t] })) },
        { name: 'type', label: 'Requirement type', value: f.type, options: REQUIREMENT_TYPES.map(t => ({ value: t, label: REQUIREMENT_TYPE_LABELS[t] })) },
        { name: 'expiring', label: 'Expiring only', type: 'checkbox', value: f.expiring ? '1' : '' },
        { name: 'unmet', label: 'Expired / not met only', type: 'checkbox', value: f.unmet ? '1' : '' },
        { name: 'sc', label: 'Safety-critical only', type: 'checkbox', value: f.safetyCritical ? '1' : '' },
      ]} />

      {matrix.error && <p className="card p-3 text-sm" role="alert" style={{ color: 'var(--red)' }}>The matrix could not be loaded: {matrix.error}</p>}
      {matrix.truncated && <p className="text-xs" style={{ color: 'var(--gold)' }}>The organisation is too large to show in full. Narrow the filters.</p>}

      <Legend />

      {m.rows.length === 0 ? (
        <SafetyEmpty icon={Grid3X3} title={filtered ? 'Nobody matches these filters' : 'Nobody to show yet'}
          text={filtered ? 'Clear a filter to widen the matrix.'
            : 'The matrix lists active workers you may see. Assign people to roles with requirements (Roles tab) and their compliance appears here.'} />
      ) : m.columns.length === 0 ? (
        <SafetyEmpty icon={Grid3X3} title="No requirements apply"
          text="None of these people has a requirement matching the filters. Add requirements to their roles or sites in the Roles tab." />
      ) : (
        <>
          {/* Grid: medium screens and up. */}
          <div className="hidden md:block table-wrapper">
            <table className="table">
              <caption className="sr-only">
                Compliance matrix: {m.rows.length} people by {m.columns.length} requirements. A dash means the requirement does not apply.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>Person</th>
                  <th scope="col">Safe to Deploy</th>
                  {m.columns.map(c => (
                    <th key={c.key} scope="col" className="text-xs" style={{ minWidth: 96, verticalAlign: 'bottom' }}>
                      <span className="block" style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>{REQUIREMENT_TYPE_LABELS[c.type]}</span>
                      {c.name}{c.safetyCritical && <span title="Safety-critical" aria-label="safety-critical"> ⚠</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.rows.map(p => {
                  const mine = m.cells.get(p.person_id);
                  return (
                    <tr key={p.person_id}>
                      <th scope="row" style={{ position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: 500, textAlign: 'left' }}>
                        <Link href={workforcePersonPath(p.person_id)} style={{ color: 'var(--ink)' }}>{p.full_name}</Link>
                      </th>
                      <td><DeploymentBadge status={p.result.status} size="sm" /></td>
                      {m.columns.map(c => {
                        const cell = mine?.get(c.key);
                        const label = cellLabel(p.full_name, c, cell, fmtDate, canSeeHealth);
                        if (!cell) return <td key={c.key} aria-label={label} style={{ color: 'var(--ink-faint)', textAlign: 'center' }}>—</td>;
                        const colour = REQUIREMENT_STATUS_COLOURS[cell.status];
                        return (
                          <td key={c.key} aria-label={label} title={label}
                            style={{ borderLeft: `3px solid ${colour}`, color: colour, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {CELL_ABBREVIATIONS[cell.status]}
                            {cell.expiresOn && showDate(c.type, canSeeHealth) && (
                              <span className="block" style={{ color: 'var(--ink-faint)', fontWeight: 400, fontSize: 11 }}>{fmtDate(cell.expiresOn)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Small screens: one card per person (spec 119). */}
          <ul className="md:hidden space-y-3" aria-label="Compliance by person">
            {m.rows.map(p => {
              const list = personRequirements(m, p.person_id);
              return (
                <li key={p.person_id} className="card p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={workforcePersonPath(p.person_id)} className="font-medium" style={{ color: 'var(--ink)' }}>{p.full_name}</Link>
                    <span className="ml-auto"><DeploymentBadge status={p.result.status} size="sm" /></span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs mt-2" style={{ color: 'var(--ink-faint)' }}>No requirements match the filters.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {list.map(({ column, cell }) => (
                        <li key={column.key} className="flex items-start gap-2 text-sm">
                          <span className="flex-1">
                            {column.name}
                            <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                              {REQUIREMENT_TYPE_LABELS[column.type]}{cell.safetyCritical ? ' · safety-critical' : ''}
                              {cell.expiresOn && showDate(column.type, canSeeHealth) ? ` · expires ${fmtDate(cell.expiresOn)}` : ''}
                            </span>
                          </span>
                          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: REQUIREMENT_STATUS_COLOURS[cell.status] }}>
                            {REQUIREMENT_STATUS_LABELS[cell.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}

function Legend() {
  return (
    <div className="card p-3">
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-soft)' }}>Key</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {REQUIREMENT_STATUSES.map(s => (
          <li key={s} className="flex items-center gap-1">
            <span style={{ borderLeft: `3px solid ${REQUIREMENT_STATUS_COLOURS[s]}`, color: REQUIREMENT_STATUS_COLOURS[s], fontWeight: 600, paddingLeft: 4 }}>
              {CELL_ABBREVIATIONS[s]}
            </span>
            <span style={{ color: 'var(--ink-faint)' }}>= {REQUIREMENT_STATUS_LABELS[s]}</span>
          </li>
        ))}
        <li className="flex items-center gap-1"><span style={{ color: 'var(--ink-faint)' }}>— = not required</span></li>
        <li className="flex items-center gap-1"><span aria-hidden>⚠</span><span style={{ color: 'var(--ink-faint)' }}>= safety-critical</span></li>
      </ul>
    </div>
  );
}
