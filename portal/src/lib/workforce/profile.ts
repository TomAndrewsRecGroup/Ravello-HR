// Person compliance profile (Core-OS 360 Phase 3, spec 47 / 87 / 103).
//
// Pure presentation helpers only — no server imports, safe in client
// components. Nothing here decides a Safe to Deploy status: the engine's
// result (136 person_deployment_status) is shown exactly as returned;
// these functions only group, label and order it.

import type { Capability } from '@/lib/auth/capabilities';
import type { DeploymentReason, DeploymentRequirement } from './types';
import {
  DEPLOYMENT_STATUSES, DEPLOYMENT_STATUS_LABELS, REQUIREMENT_TYPES, REQUIREMENT_TYPE_LABELS,
  workforcePersonPath, type DeploymentStatus, type RequirementType, type VerificationStatus,
} from './vocab';

// ─── Tabs ───────────────────────────────────────────────────────────

export const PROFILE_TABS = ['overview', 'employment', 'roles', 'training', 'competency', 'credentials', 'inductions',
  'authorisations', 'pre_employment', 'occupational_health', 'development', 'safety', 'history'] as const;
export type ProfileTab = typeof PROFILE_TABS[number];

export const PROFILE_TAB_LABELS: Record<ProfileTab, string> = {
  overview: 'Overview',
  employment: 'Employment',
  roles: 'Roles',
  training: 'Training',
  competency: 'Competency',
  credentials: 'Qualifications & licences',
  inductions: 'Inductions',
  authorisations: 'Authorisations & PPE',
  pre_employment: 'Pre-employment',
  occupational_health: 'Occupational health',
  development: 'Development',
  safety: 'Safety activity',
  history: 'History',
};

export interface Viewer {
  can: (cap: Capability) => boolean;
  /** The profile is the viewer's own person. */
  isMe: boolean;
}

/** May this viewer see occupational health OUTCOMES (category, dates, restriction)?
 *  Summary readers and the person themselves only (135 RLS says the same).
 *  Clinical detail is never shown on the profile, whoever is looking. */
export function canSeeHealthOutcomes(v: Viewer): boolean {
  return v.isMe || v.can('occupational_health.summary.read');
}

/** Tabs whose data the viewer can see (spec 47: hide sensitive tabs). */
export function visibleTabs(v: Viewer): ProfileTab[] {
  return PROFILE_TABS.filter(t => {
    if (t === 'occupational_health') return canSeeHealthOutcomes(v);
    if (t === 'safety') return v.can('incident.read');
    return true;
  });
}

/** The requested tab when the viewer may see it, else Overview. */
export function parseTab(raw: string | null | undefined, visible: readonly ProfileTab[]): ProfileTab {
  return (visible as readonly string[]).includes(raw ?? '') ? (raw as ProfileTab) : 'overview';
}

/** A YYYY-MM-DD in the past (the historical view, spec 107). Today, a
 *  future date or anything malformed means "today" (null). */
export function parseAsOf(raw: string | null | undefined, today: string): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw < today ? raw : null;
}

export function profileHref(personId: string, o: { tab?: ProfileTab; asOf?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (o.tab && o.tab !== 'overview') q.set('tab', o.tab);
  if (o.asOf) q.set('as_of', o.asOf);
  const s = q.toString();
  return s ? `${workforcePersonPath(personId)}?${s}` : workforcePersonPath(personId);
}

export const printHref = (personId: string) => `${workforcePersonPath(personId)}/print`;

// ─── The engine's requirement table ─────────────────────────────────

export interface RequirementGroup { type: RequirementType; label: string; items: DeploymentRequirement[] }

/** Group requirements by type in catalogue order; within a group,
 *  safety-critical and mandatory first, then by name. Order only. */
export function groupRequirements(reqs: readonly DeploymentRequirement[]): RequirementGroup[] {
  const order = (t: string) => { const i = (REQUIREMENT_TYPES as readonly string[]).indexOf(t); return i < 0 ? 999 : i; };
  const byType = new Map<string, DeploymentRequirement[]>();
  for (const r of reqs) {
    const list = byType.get(r.type) ?? [];
    list.push(r);
    byType.set(r.type, list);
  }
  return [...byType.entries()]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([type, items]) => ({
      type: type as RequirementType,
      label: REQUIREMENT_TYPE_LABELS[type as RequirementType] ?? type,
      items: [...items].sort((a, b) =>
        Number(b.safety_critical) - Number(a.safety_critical)
        || Number(b.mandatory) - Number(a.mandatory)
        || (a.name ?? '').localeCompare(b.name ?? '')),
    }));
}

/** Where a requirement comes from, in words. */
export function sourceText(src: DeploymentRequirement['sources'][number],
                           names: { roles: Record<string, string>; sites: Record<string, string> }): string {
  switch (src.scope) {
    case 'role': return `Role: ${names.roles[src.scope_id] ?? 'a role'}`;
    case 'site': return `Site: ${names.sites[src.scope_id] ?? 'a site'}`;
    case 'person': return 'Specific to this person';
    case 'pre_employment': return 'Pre-employment';
    default: return String((src as { scope: string }).scope);
  }
}

export function sourcesText(req: DeploymentRequirement,
                            names: { roles: Record<string, string>; sites: Record<string, string> }): string {
  const parts = [...new Set((req.sources ?? []).map(s => sourceText(s, names)))];
  return parts.length ? parts.join('; ') : '—';
}

// ─── History (deployment_status_log) ────────────────────────────────

export interface StatusLogRow { id: number; from_status: string | null; to_status: string; reasons: unknown; changed_at: string }
export interface HistoryItem { id: number; from: string; to: string; toStatus: DeploymentStatus | null; when: string; reasons: string[] }

const statusLabel = (s: string | null) =>
  s == null ? 'Not calculated' : (DEPLOYMENT_STATUS_LABELS[s as DeploymentStatus] ?? s);

/** Newest first; reasons as NAMES (the engine's reason name, else its text). */
export function historyItems(rows: readonly StatusLogRow[]): HistoryItem[] {
  return [...rows]
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at) || b.id - a.id)
    .map(r => {
      const reasons = Array.isArray(r.reasons) ? (r.reasons as Partial<DeploymentReason>[]) : [];
      const names = [...new Set(reasons.map(x => x?.name || x?.text || '').filter(Boolean))] as string[];
      return {
        id: r.id,
        from: statusLabel(r.from_status),
        to: statusLabel(r.to_status),
        toStatus: (DEPLOYMENT_STATUSES as readonly string[]).includes(r.to_status) ? (r.to_status as DeploymentStatus) : null,
        when: r.changed_at,
        reasons: names,
      };
    });
}

// ─── Evidence history ───────────────────────────────────────────────

/** Group insert-only history by a key, newest first within each group.
 *  The first item of each group is the current record; the rest is history. */
export function latestFirstBy<T>(rows: readonly T[], key: (r: T) => string, date: (r: T) => string): { key: string; latest: T; history: T[] }[] {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return [...m.entries()].map(([k, list]) => {
    const sorted = [...list].sort((a, b) => date(b).localeCompare(date(a)));
    return { key: k, latest: sorted[0], history: sorted.slice(1) };
  });
}

/** The open (not lifted) suspension, if any. */
export function openSuspension<T extends { lifted_at: string | null }>(rows: readonly T[]): T | null {
  return rows.find(r => r.lifted_at == null) ?? null;
}

export function verificationTone(s: VerificationStatus | string | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  return s === 'verified' ? 'good' : s === 'rejected' ? 'bad' : s === 'unverified' ? 'warn' : 'neutral';
}

// ─── Role change preview (136 role_change_preview, spec 87) ─────────

export interface RolePreviewRow {
  requirement_type: string; reference_id: string | null; reference_key: string | null; name: string | null;
  mandatory: boolean; safety_critical: boolean; already_required: boolean;
}

/** What the role would ADD: rows the person is not already required to meet. */
export function previewSummary(rows: readonly RolePreviewRow[]): { newMandatory: RolePreviewRow[]; newOptional: RolePreviewRow[]; alreadyCovered: number; sentence: string } {
  const fresh = rows.filter(r => !r.already_required);
  const newMandatory = fresh.filter(r => r.mandatory);
  const newOptional = fresh.filter(r => !r.mandatory);
  const n = newMandatory.length;
  const sentence = n === 0
    ? 'This role introduces no new mandatory requirements.'
    : `This role introduces ${n} new mandatory requirement${n === 1 ? '' : 's'}.`;
  return { newMandatory, newOptional, alreadyCovered: rows.length - fresh.length, sentence };
}

// ─── Duplicates (137 person_duplicate_candidates) ───────────────────

export const DUPLICATE_MATCH_LABELS: Record<string, string> = {
  email: 'Same email', phone: 'Same phone number', name: 'Same name',
};
export const duplicateMatchText = (m: readonly string[] | null | undefined) =>
  (m ?? []).map(x => DUPLICATE_MATCH_LABELS[x] ?? x).join(', ') || 'Possible match';

// ─── Training expiry suggestion ─────────────────────────────────────

/** A course's validity added to the completion date, as a suggestion the
 *  recorder may change (spec 16: evidence may say otherwise). */
export function suggestExpiry(completedOn: string, validityMonths: number | null | undefined): string {
  if (!validityMonths || !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) return '';
  const [y, m, d] = completedOn.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + validityMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// ─── Occupational health columns ────────────────────────────────────

/** The ONLY occupational-health columns the profile reads, and only from
 *  person_health_outcomes — never occupational_health_clinical. */
export const HEALTH_OUTCOME_COLUMNS = 'id, requirement_id, assessed_on, provider, outcome, restriction_summary, review_date';
/** The print view: category and dates only, no provider or restriction. */
export const HEALTH_OUTCOME_PRINT_COLUMNS = 'id, requirement_id, assessed_on, outcome, review_date';

/** Print: OH outcome category + dates only for summary readers (spec 103). */
export function printShowsHealth(can: (cap: Capability) => boolean): boolean {
  return can('occupational_health.summary.read');
}
