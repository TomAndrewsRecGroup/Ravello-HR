import type { DeploymentRequirement, MatrixRow } from './types';
import { CREDENTIAL_KINDS, DEPLOYMENT_STATUS_LABELS, ENGAGEMENT_LABELS, EXCEPTION_MAX_DAYS, WORKER_TYPE_LABELS,
  type DeploymentStatus, type EngagementType, type RequirementType } from './vocab';

// Pure helpers for the Safe to Deploy dashboard (spec 35, 76, 102).
//
// Nothing here decides a status. Every status, requirement state and
// reason comes from the engine (136/138) exactly as returned; these
// functions only COUNT what the engine said, filter rows and shape the
// export. No scores, no predictions — facts and counts only.

export interface Count { items: number; people: number }

export interface MatrixSummary {
  total: number;
  byStatus: Record<DeploymentStatus, number>;
  /** People whose result reports a safety-critical gap (engine's summary flag). */
  safetyCriticalGap: number;
  trainingUnmet: Count;
  expiringSoon: Count;
  competencyMissing: Count;
  documentsMissing: Count;
  inductionIncomplete: Count;
  healthReviewsDue: Count;
  awaitingVerification: Count;
}

const DOC_TYPES: ReadonlySet<RequirementType> = new Set<RequirementType>([...CREDENTIAL_KINDS, 'document']);

/** Which requirement-level buckets a requirement falls in (a requirement may count in more than one). */
export function requirementBuckets(r: Pick<DeploymentRequirement, 'type' | 'status'>): (keyof Omit<MatrixSummary, 'total' | 'byStatus' | 'safetyCriticalGap'>)[] {
  const out: (keyof Omit<MatrixSummary, 'total' | 'byStatus' | 'safetyCriticalGap'>)[] = [];
  if (r.status === 'expiring') out.push('expiringSoon');
  if (r.status === 'review') out.push('awaitingVerification');
  if (r.status === 'unmet') {
    if (r.type === 'training') out.push('trainingUnmet');
    if (r.type === 'competency') out.push('competencyMissing');
    if (DOC_TYPES.has(r.type)) out.push('documentsMissing');
    if (r.type === 'induction') out.push('inductionIncomplete');
  }
  if (r.type === 'medical' && (r.status === 'unmet' || r.status === 'expiring')) out.push('healthReviewsDue');
  return out;
}

export function summariseMatrix(rows: MatrixRow[]): MatrixSummary {
  const zero = (): Count => ({ items: 0, people: 0 });
  const s: MatrixSummary = {
    total: rows.length,
    byStatus: { READY: 0, CONDITIONALLY_READY: 0, NOT_READY: 0, REVIEW_REQUIRED: 0 },
    safetyCriticalGap: 0,
    trainingUnmet: zero(), expiringSoon: zero(), competencyMissing: zero(), documentsMissing: zero(),
    inductionIncomplete: zero(), healthReviewsDue: zero(), awaitingVerification: zero(),
  };
  for (const row of rows) {
    const status = row.result?.status;
    // An unknown or missing status is never counted as Ready.
    if (status && status in s.byStatus) s.byStatus[status] += 1;
    else s.byStatus.REVIEW_REQUIRED += 1;
    if (row.result?.summary?.safety_critical_gap) s.safetyCriticalGap += 1;
    const seen = new Set<string>();
    for (const req of row.result?.requirements ?? []) {
      for (const b of requirementBuckets(req)) {
        s[b].items += 1;
        if (!seen.has(b)) { seen.add(b); s[b].people += 1; }
      }
    }
  }
  return s;
}

export interface MatrixFilters {
  q?: string; status?: string; site?: string; department?: string; role?: string;
  workerType?: string; engagement?: string; scGap?: boolean; expiring?: boolean;
}

export function filterMatrix(rows: MatrixRow[], f: MatrixFilters): MatrixRow[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return rows.filter(r =>
    (!q || r.full_name.toLowerCase().includes(q))
    && (!f.status || r.result?.status === f.status)
    && (!f.site || r.site_id === f.site)
    && (!f.department || r.department_id === f.department)
    && (!f.role || r.primary_role_id === f.role)
    && (!f.workerType || r.worker_type === f.workerType)
    && (!f.engagement || r.engagement_type === f.engagement)
    && (!f.scGap || r.result?.summary?.safety_critical_gap === true)
    && (!f.expiring || (r.result?.summary?.expiring ?? 0) > 0));
}

export interface NameMaps { roles: Map<string, string>; sites: Map<string, string>; departments: Map<string, string> }

export const WORKFORCE_CSV_COLUMNS = [
  { key: 'name', label: 'Name' }, { key: 'status', label: 'Safe to Deploy' }, { key: 'role', label: 'Role' },
  { key: 'site', label: 'Site' }, { key: 'department', label: 'Department' }, { key: 'worker_type', label: 'Worker type' },
  { key: 'engagement', label: 'Engagement' }, { key: 'required', label: 'Required' }, { key: 'met', label: 'Met' },
  { key: 'unmet', label: 'Not met' }, { key: 'review', label: 'Awaiting verification' }, { key: 'expiring', label: 'Expiring' },
  { key: 'safety_critical_gap', label: 'Safety-critical gap' }, { key: 'reasons', label: 'Reasons' },
  { key: 'calculated', label: 'Calculated' },
];

/**
 * The export (spec 102). Summary counts and the engine's reason text
 * only — never requirement detail, so nothing about an occupational
 * health requirement beyond "not met / expiring" can leave the page.
 */
export function matrixCsvRows(rows: MatrixRow[], names: NameMaps): Record<string, string | number>[] {
  const nm = (m: Map<string, string>, id: string | null) => (id ? m.get(id) ?? '' : '');
  return rows.map(r => {
    const sum = r.result?.summary;
    const st = r.result?.status;
    return {
      name: r.full_name,
      status: st ? DEPLOYMENT_STATUS_LABELS[st] ?? st : 'Review required',
      role: nm(names.roles, r.primary_role_id),
      site: nm(names.sites, r.site_id),
      department: nm(names.departments, r.department_id),
      worker_type: WORKER_TYPE_LABELS[r.worker_type] ?? r.worker_type,
      engagement: r.engagement_type ? ENGAGEMENT_LABELS[r.engagement_type as EngagementType] ?? r.engagement_type : '',
      required: sum?.required ?? 0,
      met: sum?.met ?? 0,
      unmet: sum?.unmet ?? 0,
      review: sum?.review ?? 0,
      expiring: sum?.expiring ?? 0,
      safety_critical_gap: sum?.safety_critical_gap ? 'Yes' : 'No',
      reasons: (r.result?.reasons ?? []).map(x => x.text).filter(Boolean).join('; '),
      calculated: r.result?.computed_at ?? '',
    };
  });
}

// ─── Exceptions (134 requirement_exceptions) ─────────────────────────

/** Whole days from a to b (ISO dates, UTC calendar days). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The same limits 134 enforces (reason 10-1000 characters, start not in
 * the past, end no more than 90 days after the start), checked before
 * the call so the person gets a plain message. The database still
 * decides: this never replaces its CHECK.
 */
export function exceptionProblem(a: { reason: string; validFrom: string; validUntil: string; today: string }): string | null {
  const reason = a.reason.trim();
  if (reason.length < 10) return 'Give a reason of at least 10 characters.';
  if (reason.length > 1000) return 'Keep the reason under 1,000 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.validFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(a.validUntil)) return 'Choose a start and an end date.';
  if (a.validFrom < a.today) return 'An exception cannot start in the past.';
  if (a.validUntil < a.validFrom) return 'The end date must be on or after the start date.';
  if (daysBetween(a.validFrom, a.validUntil) > EXCEPTION_MAX_DAYS) return `An exception lasts at most ${EXCEPTION_MAX_DAYS} days.`;
  return null;
}

export type ExceptionState = 'revoked' | 'lapsed' | 'scheduled' | 'in_force';
export const EXCEPTION_STATE_LABELS: Record<ExceptionState, string> = {
  revoked: 'Revoked', lapsed: 'Ended', scheduled: 'Not started yet', in_force: 'In force',
};
/** Where an exception stands on `today` — dates only, the same test the engine applies. */
export function exceptionState(e: { valid_from: string; valid_until: string; revoked_at: string | null }, today: string): ExceptionState {
  if (e.revoked_at && e.revoked_at.slice(0, 10) <= today) return 'revoked';
  if (e.valid_until < today) return 'lapsed';
  if (e.valid_from > today) return 'scheduled';
  return 'in_force';
}
