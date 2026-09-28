import type { DeploymentRequirement, MatrixRow } from './types';
import {
  REQUIREMENT_STATUS_LABELS, REQUIREMENT_TYPES, REQUIREMENT_TYPE_LABELS,
  type RequirementStatus, type RequirementType,
} from './vocab';

// The compliance matrix (spec 18, 119): person × requirement, pivoted
// from ONE workforce_matrix (138) read. Pure: no database, no dates of
// its own beyond what it is given. Every status here is the ENGINE's
// status for that requirement (136); nothing is recalculated — this
// file only decides which rows and columns to show and how to label
// them.

/** A requirement column: one distinct requirement across the visible people. */
export interface MatrixColumn {
  key: string;
  type: RequirementType;
  name: string;
  /** Safety-critical for at least one person it applies to. */
  safetyCritical: boolean;
}

export interface MatrixCell {
  status: RequirementStatus;
  expiresOn: string | null;
  safetyCritical: boolean;
}

export interface MatrixFilters {
  site?: string;
  department?: string;
  role?: string;
  manager?: string;
  worker?: string;
  type?: string;
  expiring?: boolean;
  unmet?: boolean;
  safetyCritical?: boolean;
}

export interface PivotedMatrix {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  /** cells.get(person_id)?.get(column.key) — absent means "not required". */
  cells: Map<string, Map<string, MatrixCell>>;
}

/** The identity of a requirement across people. */
export function requirementKey(r: Pick<DeploymentRequirement, 'type' | 'reference_id' | 'reference_key'>): string {
  return `${r.type}:${r.reference_id ?? r.reference_key ?? ''}`;
}

/** Short cell words — always shown WITH colour, never colour alone. */
export const CELL_ABBREVIATIONS: Record<RequirementStatus, string> = {
  met: 'Met',
  expiring: 'Expiring',
  met_with_restrictions: 'Restricted',
  excepted: 'Exception',
  not_applicable: 'N/A',
  review: 'Verify',
  unmet: 'Not met',
};

const EXPIRING: ReadonlySet<RequirementStatus> = new Set(['expiring']);
const UNMET: ReadonlySet<RequirementStatus> = new Set(['unmet', 'review']);

function typeOrder(t: RequirementType): number {
  const i = REQUIREMENT_TYPES.indexOf(t);
  return i === -1 ? REQUIREMENT_TYPES.length : i;
}

/**
 * Pivot and filter.
 * - People filters (site, department, role, manager, worker type) narrow ROWS.
 *   `roleAssignments` maps a person to the roles they are actively assigned
 *   (their primary role always counts).
 * - Requirement filters (type, safety-critical) narrow COLUMNS and cells.
 * - "Expiring only" / "Expired or not met only" keep the people with at
 *   least one such requirement among the remaining columns, and the
 *   columns with at least one such cell.
 */
export function pivotMatrix(
  input: readonly MatrixRow[],
  filters: MatrixFilters = {},
  roleAssignments: ReadonlyMap<string, readonly string[]> = new Map(),
): PivotedMatrix {
  const people = input.filter(p => {
    if (filters.site && p.site_id !== filters.site) return false;
    if (filters.department && p.department_id !== filters.department) return false;
    if (filters.manager && p.manager_id !== filters.manager) return false;
    if (filters.worker && p.engagement_type !== filters.worker && p.worker_type !== filters.worker) return false;
    if (filters.role) {
      const roles = new Set([...(roleAssignments.get(p.person_id) ?? []), ...(p.primary_role_id ? [p.primary_role_id] : [])]);
      if (!roles.has(filters.role)) return false;
    }
    return true;
  });

  const keepReq = (r: DeploymentRequirement) =>
    (!filters.type || r.type === filters.type) && (!filters.safetyCritical || r.safety_critical);

  const cols = new Map<string, MatrixColumn>();
  const cells = new Map<string, Map<string, MatrixCell>>();
  for (const p of people) {
    const mine = new Map<string, MatrixCell>();
    for (const r of p.result?.requirements ?? []) {
      if (!keepReq(r)) continue;
      const key = requirementKey(r);
      const existing = cols.get(key);
      if (!existing) {
        cols.set(key, { key, type: r.type, name: r.name ?? REQUIREMENT_TYPE_LABELS[r.type] ?? r.type, safetyCritical: r.safety_critical });
      } else if (r.safety_critical) {
        existing.safetyCritical = true;
      }
      mine.set(key, { status: r.status, expiresOn: r.expires_on, safetyCritical: r.safety_critical });
    }
    cells.set(p.person_id, mine);
  }

  const wanted: ReadonlySet<RequirementStatus> | null =
    filters.expiring && filters.unmet ? new Set([...EXPIRING, ...UNMET])
    : filters.expiring ? EXPIRING
    : filters.unmet ? UNMET
    : null;

  let rows = people;
  let columns = [...cols.values()];
  if (wanted) {
    const hitCols = new Set<string>();
    rows = people.filter(p => {
      let hit = false;
      for (const [key, c] of cells.get(p.person_id) ?? []) {
        if (wanted.has(c.status)) { hit = true; hitCols.add(key); }
      }
      return hit;
    });
    columns = columns.filter(c => hitCols.has(c.key));
  }

  columns.sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || a.name.localeCompare(b.name));
  return { columns, rows, cells };
}

/** Whether a viewer may see dates on an occupational health requirement. */
export function showDate(type: RequirementType, canSeeHealth: boolean): boolean {
  return type !== 'medical' || canSeeHealth;
}

/** The accessible name of one cell. */
export function cellLabel(personName: string, column: MatrixColumn, cell: MatrixCell | undefined,
                          fmt: (d: string) => string, canSeeHealth: boolean): string {
  if (!cell) return `${personName} — ${column.name}: not required`;
  let s = `${personName} — ${column.name}: ${REQUIREMENT_STATUS_LABELS[cell.status] ?? cell.status}`;
  if (cell.expiresOn && showDate(column.type, canSeeHealth)) s += `, expires ${fmt(cell.expiresOn)}`;
  if (cell.safetyCritical) s += ', safety-critical';
  return s;
}

export interface MatrixCsvRow extends Record<string, unknown> {
  person: string;
  requirement_type: string;
  requirement: string;
  status: string;
  expires_on: string;
  safety_critical: string;
}

/**
 * One CSV row per person × requirement, in the order shown. An
 * occupational health requirement carries its STATUS only — never a date
 * or any detail — whoever exports it.
 */
export function matrixCsvRows(m: PivotedMatrix): MatrixCsvRow[] {
  const out: MatrixCsvRow[] = [];
  for (const p of m.rows) {
    const mine = m.cells.get(p.person_id);
    for (const c of m.columns) {
      const cell = mine?.get(c.key);
      if (!cell) continue;
      const medical = c.type === 'medical';
      out.push({
        person: p.full_name,
        requirement_type: REQUIREMENT_TYPE_LABELS[c.type] ?? c.type,
        requirement: c.name,
        status: REQUIREMENT_STATUS_LABELS[cell.status] ?? cell.status,
        expires_on: medical ? '' : cell.expiresOn ?? '',
        safety_critical: cell.safetyCritical ? 'Yes' : 'No',
      });
    }
  }
  return out;
}

export const MATRIX_CSV_COLUMNS = [
  { key: 'person', label: 'Person' },
  { key: 'requirement_type', label: 'Requirement type' },
  { key: 'requirement', label: 'Requirement' },
  { key: 'status', label: 'Status' },
  { key: 'expires_on', label: 'Expires on' },
  { key: 'safety_critical', label: 'Safety-critical' },
];

/** A person's requirements for the mobile list: problems first, then by name. */
export function personRequirements(m: PivotedMatrix, personId: string): { column: MatrixColumn; cell: MatrixCell }[] {
  const rank: Record<RequirementStatus, number> = {
    unmet: 0, review: 1, expiring: 2, met_with_restrictions: 3, excepted: 4, met: 5, not_applicable: 6,
  };
  const mine = m.cells.get(personId);
  return m.columns
    .flatMap(column => { const cell = mine?.get(column.key); return cell ? [{ column, cell }] : []; })
    .sort((a, b) => (rank[a.cell.status] ?? 9) - (rank[b.cell.status] ?? 9) || a.column.name.localeCompare(b.column.name));
}

// ─── Health surveillance matrix (spec 42) ───────────────────────────

/** One person_health_outcomes row as read under the viewer's session. */
export interface HealthOutcomeRow {
  id: string;
  person_id: string;
  requirement_id: string | null;
  assessed_on: string;
  provider: string | null;
  outcome: string;
  restriction_summary: string | null;
  review_date: string | null;
  created_at: string;
}

export interface SurveillanceRow {
  personId: string;
  personName: string;
  requirementId: string;
  requirementName: string;
  safetyCritical: boolean;
  /** The engine's status for this requirement (136) — never recalculated here. */
  status: RequirementStatus;
  latest: HealthOutcomeRow | null;
  /** The review date on the latest outcome, else the engine's next due date. */
  nextDue: string | null;
}

/** The latest outcome per person + requirement: newest assessment, then newest record. */
export function latestOutcomes(rows: readonly HealthOutcomeRow[]): Map<string, HealthOutcomeRow> {
  const out = new Map<string, HealthOutcomeRow>();
  for (const r of rows) {
    if (!r.requirement_id) continue;
    const k = `${r.person_id}|${r.requirement_id}`;
    const cur = out.get(k);
    if (!cur || r.assessed_on > cur.assessed_on || (r.assessed_on === cur.assessed_on && r.created_at > cur.created_at)) out.set(k, r);
  }
  return out;
}

/** People × the occupational health requirements that apply to them (from the engine), with the latest outcome. */
export function surveillanceRows(people: readonly MatrixRow[], outcomes: readonly HealthOutcomeRow[]): SurveillanceRow[] {
  const latest = latestOutcomes(outcomes);
  const out: SurveillanceRow[] = [];
  for (const p of people) {
    for (const r of p.result?.requirements ?? []) {
      if (r.type !== 'medical' || !r.reference_id) continue;
      const l = latest.get(`${p.person_id}|${r.reference_id}`) ?? null;
      out.push({
        personId: p.person_id, personName: p.full_name, requirementId: r.reference_id,
        requirementName: r.name ?? 'Occupational health', safetyCritical: r.safety_critical, status: r.status,
        latest: l, nextDue: l?.review_date ?? r.expires_on ?? null,
      });
    }
  }
  return out.sort((a, b) => a.personName.localeCompare(b.personName) || a.requirementName.localeCompare(b.requirementName));
}
