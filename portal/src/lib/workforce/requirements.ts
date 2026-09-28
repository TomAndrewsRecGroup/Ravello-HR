// Pure helpers for the requirement rules (133) and the workforce
// catalogues. No server imports: safe in client components.
//
// A rule's STATE is a fact about its dates, read the same way the
// database's own guard (requirement_rule_guard) reads them:
//   draft      effective_from IS NULL             — editable, applies to no one
//   scheduled  effective_from > today             — not yet in force
//   in_force   effective_from <= today, not ended — immutable; supersede to change
//   history    ended before today                 — never changes again
//
// Nothing here decides whether anybody is Safe to Deploy. That is the
// engine's job (136); these helpers only sort and validate rule rows.

import {
  REQUIREMENT_TYPES, REQUIREMENT_TYPE_LABELS, REQUIREMENT_CATALOGUE, CREDENTIAL_KINDS,
  ASSESSMENT_METHODS, ASSESSMENT_METHOD_LABELS, INDUCTION_SCOPES, AUTHORISATION_SCOPE_KINDS, SESSION_STATUSES,
  type RequirementType, type CredentialKind,
} from './vocab';

// ─── Rule tables and scopes ─────────────────────────────────────────

export const RULE_TABLES = ['role_requirements', 'site_requirements'] as const;
export type RuleTable = typeof RULE_TABLES[number];
export const RULE_SCOPE_COLUMN: Record<RuleTable, 'role_id' | 'site_id'> = {
  role_requirements: 'role_id',
  site_requirements: 'site_id',
};

export interface RuleRow {
  id: string;
  requirement_type: RequirementType;
  reference_id: string | null;
  reference_key: string | null;
  min_level_id: string | null;
  mandatory: boolean;
  safety_critical: boolean;
  evidence_required: boolean;
  allow_elearning: boolean;
  validity_months: number | null;
  grace_days: number;
  effective_from: string | null;
  effective_until: string | null;
  superseded_by: string | null;
  source_type: string | null;
  notes: string | null;
  created_at: string;
}

/** The columns every rule read selects (one literal, so supabase-js can type it). */
export const RULE_COLUMNS =
  'id, requirement_type, reference_id, reference_key, min_level_id, mandatory, safety_critical, evidence_required, allow_elearning, validity_months, grace_days, effective_from, effective_until, superseded_by, source_type, notes, created_at' as const;

export type RuleState = 'draft' | 'scheduled' | 'in_force' | 'history';

/** Dates are ISO yyyy-mm-dd strings, which compare correctly as strings. */
export function ruleState(r: Pick<RuleRow, 'effective_from' | 'effective_until'>, today: string): RuleState {
  if (!r.effective_from) return 'draft';
  // Ended before today, or ended before it ever started (activated then replaced the same day).
  if (r.effective_until && (r.effective_until < today || r.effective_until < r.effective_from)) return 'history';
  if (r.effective_from > today) return 'scheduled';
  return 'in_force';
}

export interface GroupedRules<T> { in_force: T[]; draft: T[]; scheduled: T[]; history: T[] }

const TYPE_ORDER = new Map(REQUIREMENT_TYPES.map((t, i) => [t, i]));

/** Group rules by state; within a group, by requirement type then oldest first (history: most recently ended first). */
export function groupRules<T extends Pick<RuleRow, 'requirement_type' | 'effective_from' | 'effective_until' | 'created_at'>>(
  rules: T[], today: string,
): GroupedRules<T> {
  const g: GroupedRules<T> = { in_force: [], draft: [], scheduled: [], history: [] };
  for (const r of rules) g[ruleState(r, today)].push(r);
  const byType = (a: T, b: T) =>
    (TYPE_ORDER.get(a.requirement_type) ?? 99) - (TYPE_ORDER.get(b.requirement_type) ?? 99) || a.created_at.localeCompare(b.created_at);
  g.in_force.sort(byType);
  g.draft.sort(byType);
  g.scheduled.sort((a, b) => (a.effective_from ?? '').localeCompare(b.effective_from ?? '') || byType(a, b));
  g.history.sort((a, b) => (b.effective_until ?? '').localeCompare(a.effective_until ?? '') || byType(a, b));
  return g;
}

/** Count of rules in force today (for list pages). */
export function countInForce(rules: Pick<RuleRow, 'effective_from' | 'effective_until'>[], today: string): number {
  return rules.filter(r => ruleState(r, today) === 'in_force').length;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The earliest end date the database accepts (never retroactive: yesterday onwards). */
export const earliestEndDate = (today: string) => addDaysIso(today, -1);

/**
 * When activating a draft, the in-force (or scheduled) rule it most likely
 * replaces: same type and same catalogue item. Only a SUGGESTION — the
 * person chooses, and "replaces nothing" is always offered.
 */
export function suggestReplaced<T extends Pick<RuleRow, 'id' | 'requirement_type' | 'reference_id' | 'reference_key' | 'effective_from' | 'effective_until'>>(
  draft: T, rules: T[], today: string,
): T | null {
  return replaceableRules(rules, today).find(r =>
    r.id !== draft.id && r.requirement_type === draft.requirement_type
    && (r.reference_id ?? null) === (draft.reference_id ?? null) && (r.reference_key ?? null) === (draft.reference_key ?? null)) ?? null;
}

/** Rules a draft may replace: in force or scheduled, and not already given an end date. */
export function replaceableRules<T extends Pick<RuleRow, 'effective_from' | 'effective_until'>>(rules: T[], today: string): T[] {
  return rules.filter(r => {
    const s = ruleState(r, today);
    return (s === 'in_force' || s === 'scheduled') && !r.effective_until;
  });
}

// ─── The add / edit form ────────────────────────────────────────────

export interface RuleForm {
  requirement_type: RequirementType | '';
  reference_id: string;
  reference_key: string;
  min_level_id: string;
  mandatory: boolean;
  safety_critical: boolean;
  evidence_required: boolean;
  allow_elearning: boolean;
  validity_months: string;
  grace_days: string;
  notes: string;
  /** 'draft' saves with no start date; 'from' puts it in force from `effective_from`. */
  mode: 'draft' | 'from';
  effective_from: string;
}

export const EMPTY_RULE_FORM: RuleForm = {
  requirement_type: '', reference_id: '', reference_key: '', min_level_id: '',
  mandatory: true, safety_critical: false, evidence_required: false, allow_elearning: true,
  validity_months: '', grace_days: '0', notes: '', mode: 'draft', effective_from: '',
};

/** The editable fields of a rule, as written to the database. */
export interface RuleFields {
  requirement_type: RequirementType;
  reference_id: string | null;
  reference_key: string | null;
  min_level_id: string | null;
  mandatory: boolean;
  safety_critical: boolean;
  evidence_required: boolean;
  allow_elearning: boolean;
  validity_months: number | null;
  grace_days: number;
  notes: string | null;
}

export function ruleToForm(r: RuleRow): RuleForm {
  return {
    requirement_type: r.requirement_type, reference_id: r.reference_id ?? '', reference_key: r.reference_key ?? '',
    min_level_id: r.min_level_id ?? '', mandatory: r.mandatory, safety_critical: r.safety_critical,
    evidence_required: r.evidence_required, allow_elearning: r.allow_elearning,
    validity_months: r.validity_months == null ? '' : String(r.validity_months), grace_days: String(r.grace_days ?? 0),
    notes: r.notes ?? '', mode: 'draft', effective_from: '',
  };
}

function intIn(raw: string, min: number, max: number): number | null | 'bad' {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return 'bad';
  const n = Number(s);
  return n >= min && n <= max ? n : 'bad';
}

/**
 * Validate the form. Returns the fields to write, or a message for a person.
 * `checkStart` is false when editing a draft (its start date is set on activation).
 */
export function validateRuleForm(f: RuleForm, today: string, checkStart = true):
  { ok: true; fields: RuleFields; effective_from: string | null } | { ok: false; message: string } {
  if (!f.requirement_type || !(REQUIREMENT_TYPES as readonly string[]).includes(f.requirement_type)) {
    return { ok: false, message: 'Choose the type of requirement.' };
  }
  const type = f.requirement_type;
  let reference_id: string | null = null;
  let reference_key: string | null = null;
  if (type === 'document') {
    reference_key = f.reference_key.trim();
    if (!reference_key) return { ok: false, message: 'Name the document this requirement needs.' };
    if (reference_key.length > 100) return { ok: false, message: 'The document name must be 100 characters or fewer.' };
  } else {
    reference_id = f.reference_id || null;
    if (!reference_id) return { ok: false, message: `Choose the ${REQUIREMENT_TYPE_LABELS[type].toLowerCase()} from the catalogue.` };
  }
  const min_level_id = type === 'competency' ? (f.min_level_id || null) : null;
  if (type === 'competency' && !min_level_id) return { ok: false, message: 'Choose the minimum competency level.' };
  const validity = intIn(f.validity_months, 1, 600);
  if (validity === 'bad') return { ok: false, message: 'Validity must be a whole number of months between 1 and 600, or blank.' };
  const grace = intIn(f.grace_days, 0, 90);
  if (grace === 'bad') return { ok: false, message: 'Grace must be a whole number of days between 0 and 90.' };
  const notes = f.notes.trim();
  if (notes.length > 2000) return { ok: false, message: 'Notes must be 2,000 characters or fewer.' };

  let effective_from: string | null = null;
  if (checkStart && f.mode === 'from') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.effective_from)) return { ok: false, message: 'Choose the date the requirement comes into force.' };
    if (f.effective_from < today) return { ok: false, message: 'A requirement cannot start in the past. Choose today or a later date.' };
    effective_from = f.effective_from;
  }
  return {
    ok: true,
    effective_from,
    fields: {
      requirement_type: type, reference_id, reference_key, min_level_id,
      mandatory: f.mandatory, safety_critical: f.safety_critical, evidence_required: f.evidence_required,
      allow_elearning: f.allow_elearning, validity_months: validity, grace_days: grace ?? 0, notes: notes || null,
    },
  };
}

/** The row to INSERT for a new rule on a role or site. created_by, ids and timestamps are the database's. */
export function buildRuleInsert(table: RuleTable, scopeId: string, companyId: string, fields: RuleFields, effective_from: string | null) {
  return { company_id: companyId, [RULE_SCOPE_COLUMN[table]]: scopeId, ...fields, effective_from, source_type: 'manual' as const };
}

// ─── Catalogue items a requirement may point at ─────────────────────

export interface CatalogueOption { id: string; title: string; kind?: string | null; company_id: string | null; active: boolean }

/** The catalogue table (and credential kind, when one applies) for a requirement type. Document has none. */
export function catalogueFor(type: RequirementType): { table: string; kind: CredentialKind | null } | null {
  if (type === 'document') return null;
  const kind = (CREDENTIAL_KINDS as readonly string[]).includes(type) ? (type as CredentialKind) : null;
  return { table: REQUIREMENT_CATALOGUE[type], kind };
}

/** Options a person may pick for a type: the right table, the right credential kind, active only. */
export function optionsForType(type: RequirementType | '', byTable: Record<string, CatalogueOption[]>): CatalogueOption[] {
  if (!type) return [];
  const c = catalogueFor(type);
  if (!c) return [];
  return (byTable[c.table] ?? []).filter(o => o.active && (c.kind == null || o.kind === c.kind))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Title of the catalogue item a rule points at, for display (inactive items still resolve). */
export function referenceTitle(r: Pick<RuleRow, 'requirement_type' | 'reference_id' | 'reference_key'>, byTable: Record<string, CatalogueOption[]>): string {
  if (r.requirement_type === 'document') return r.reference_key ?? '—';
  const c = catalogueFor(r.requirement_type);
  const hit = c ? (byTable[c.table] ?? []).find(o => o.id === r.reference_id) : undefined;
  return hit ? hit.title + (hit.active ? '' : ' (inactive)') : 'Not visible in this organisation';
}

// ─── Catalogue editing (the catalogue page) ─────────────────────────

// Delivery methods and occupational health categories live in vocab.ts
// with the other tuples; re-exported here for this file's callers.
export { DELIVERY_METHODS, DELIVERY_METHOD_LABELS, OH_REQUIREMENT_CATEGORIES, OH_REQUIREMENT_CATEGORY_LABELS } from './vocab';
import { DELIVERY_METHODS, DELIVERY_METHOD_LABELS, OH_REQUIREMENT_CATEGORIES, OH_REQUIREMENT_CATEGORY_LABELS } from './vocab';
const CREDENTIAL_KIND_LABELS: Record<CredentialKind, string> = {
  qualification: 'Qualification', certification: 'Certification', licence: 'Licence', card: 'Card', permit: 'Permit',
};
const INDUCTION_SCOPE_LABELS: Record<typeof INDUCTION_SCOPES[number], string> = {
  company: 'Company', site: 'Site', project: 'Project', department: 'Department', contractor: 'Contractor', role: 'Role',
};
const AUTH_SCOPE_LABELS: Record<typeof AUTHORISATION_SCOPE_KINDS[number], string> = {
  general: 'General', site: 'Site', plant: 'Plant', equipment: 'Equipment', voltage: 'Voltage', permit: 'Permit',
};

export type FieldKind = 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'site';
export interface CatalogueField {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  max?: number;           // text length, or number upper bound
  min?: number;           // number lower bound
  pattern?: RegExp;       // text format
  patternHint?: string;
  options?: { value: string; label: string }[];
  /** Set on create only (changing it would change what existing rules mean). */
  createOnly?: boolean;
  /** Shown as a list column. */
  column?: boolean;
}

export const CATALOGUE_TABS = ['courses', 'competencies', 'credentials', 'inductions', 'health', 'authorisations', 'ppe', 'checks', 'sites'] as const;
export type CatalogueTab = typeof CATALOGUE_TABS[number];
export type EditableTab = Exclude<CatalogueTab, 'sites'>;

export interface CatalogueConfig {
  label: string;
  table: string;
  /** Global rows (company_id NULL) exist for this table. */
  hasGlobal: boolean;
  intro: string;
  fields: CatalogueField[];
  /** Columns selected for the list (one literal per table). */
  select: string;
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map(v => ({ value: v as string, label: labels[v] }));
const title: CatalogueField = { name: 'title', label: 'Title', kind: 'text', required: true, max: 200, column: true };
const months = (name: string, label: string, max = 600): CatalogueField => ({ name, label, kind: 'number', min: 1, max, column: true });
const bool = (name: string, label: string, column = true): CatalogueField => ({ name, label, kind: 'bool', column });

export const CATALOGUE_CONFIG: Record<EditableTab, CatalogueConfig> = {
  courses: {
    label: 'Courses', table: 'training_courses', hasGlobal: true,
    intro: 'Training courses a role or site can require. A course records that training happened; it never makes anyone competent on its own.',
    select: 'id, company_id, title, description, category, delivery_method, provider, validity_months, refresher_required, safety_critical, certificate_expected, active_status',
    fields: [
      title,
      { name: 'category', label: 'Category', kind: 'text', max: 100, column: true },
      { name: 'delivery_method', label: 'Delivery', kind: 'select', required: true, options: opts(DELIVERY_METHODS, DELIVERY_METHOD_LABELS), column: true },
      { name: 'provider', label: 'Provider', kind: 'text', max: 200, column: true },
      months('validity_months', 'Valid for (months)'),
      bool('refresher_required', 'Refresher required'),
      bool('safety_critical', 'Safety-critical'),
      bool('certificate_expected', 'Certificate expected'),
      { name: 'description', label: 'Description', kind: 'textarea', max: 4000 },
    ],
  },
  competencies: {
    label: 'Competencies', table: 'competencies', hasGlobal: true,
    intro: 'Competencies are met only by a verified assessment at the required level — never by training alone.',
    select: 'id, company_id, title, description, category, safety_critical, assessment_method, renewal_months, active_status',
    fields: [
      title,
      { name: 'category', label: 'Category', kind: 'text', max: 100, column: true },
      { name: 'assessment_method', label: 'Assessment method', kind: 'select', required: true, options: opts(ASSESSMENT_METHODS, ASSESSMENT_METHOD_LABELS), column: true },
      months('renewal_months', 'Reassess every (months)'),
      bool('safety_critical', 'Safety-critical'),
      { name: 'description', label: 'Description', kind: 'textarea', max: 4000 },
    ],
  },
  credentials: {
    label: 'Qualifications & licences', table: 'credential_types', hasGlobal: true,
    intro: 'Qualifications, certifications, licences, cards and permits. The kind decides which requirement type can use it.',
    select: 'id, company_id, kind, title, awarding_body, description, validity_months, active_status',
    fields: [
      { name: 'kind', label: 'Kind', kind: 'select', required: true, createOnly: true, options: opts(CREDENTIAL_KINDS, CREDENTIAL_KIND_LABELS), column: true },
      title,
      { name: 'awarding_body', label: 'Awarding body', kind: 'text', max: 200, column: true },
      months('validity_months', 'Valid for (months)'),
      { name: 'description', label: 'Description', kind: 'textarea', max: 2000 },
    ],
  },
  inductions: {
    label: 'Inductions', table: 'induction_templates', hasGlobal: false,
    intro: 'Induction templates for the organisation, a site, a project, a department, contractors or a role.',
    select: 'id, company_id, title, scope, site_id, content, reinduction_months, active_status',
    fields: [
      title,
      { name: 'scope', label: 'Scope', kind: 'select', required: true, options: opts(INDUCTION_SCOPES, INDUCTION_SCOPE_LABELS), column: true },
      { name: 'site_id', label: 'Site', kind: 'site', column: true },
      months('reinduction_months', 'Re-induct every (months)'),
      { name: 'content', label: 'Content', kind: 'textarea', max: 20000 },
    ],
  },
  health: {
    label: 'Occupational health', table: 'occupational_health_requirements', hasGlobal: true,
    intro: 'The occupational health requirements a role or site can require. This is a catalogue of requirement types — it holds no information about any person.',
    select: 'id, company_id, title, category, frequency_months, safety_critical, active_status',
    fields: [
      title,
      { name: 'category', label: 'Category', kind: 'select', required: true, options: opts(OH_REQUIREMENT_CATEGORIES, OH_REQUIREMENT_CATEGORY_LABELS), column: true },
      months('frequency_months', 'Repeat every (months)'),
      bool('safety_critical', 'Safety-critical'),
    ],
  },
  authorisations: {
    label: 'Authorisation types', table: 'authorisation_types', hasGlobal: false,
    intro: 'Formal authorisations a person can be issued (for example a site, plant or voltage authorisation).',
    select: 'id, company_id, title, description, scope_kind, validity_months, safety_critical, active_status',
    fields: [
      title,
      { name: 'scope_kind', label: 'Scope', kind: 'select', required: true, options: opts(AUTHORISATION_SCOPE_KINDS, AUTH_SCOPE_LABELS), column: true },
      months('validity_months', 'Valid for (months)'),
      bool('safety_critical', 'Safety-critical'),
      { name: 'description', label: 'Description', kind: 'textarea', max: 2000 },
    ],
  },
  ppe: {
    label: 'PPE types', table: 'ppe_types', hasGlobal: true,
    intro: 'Personal protective equipment a role or site can require to be issued.',
    select: 'id, company_id, title, replacement_months, active_status',
    fields: [title, months('replacement_months', 'Replace every (months)', 240)],
  },
  checks: {
    label: 'Pre-employment checks', table: 'pre_employment_check_types', hasGlobal: true,
    intro: 'Checks that must be complete before someone can be deployed (right to work, references and so on).',
    select: 'id, company_id, key, title, active_status',
    fields: [
      { name: 'key', label: 'Key', kind: 'text', required: true, createOnly: true, max: 60, pattern: /^[a-z_]{2,60}$/,
        patternHint: 'Lower-case letters and underscores only, 2 to 60 characters (for example "dbs_check").', column: true },
      title,
    ],
  },
};

export type FormValues = Record<string, string | boolean>;

export function emptyValues(tab: EditableTab): FormValues {
  const v: FormValues = {};
  for (const f of CATALOGUE_CONFIG[tab].fields) v[f.name] = f.kind === 'bool' ? false : (f.kind === 'select' && f.required ? f.options?.[0]?.value ?? '' : '');
  return v;
}

export function rowToValues(tab: EditableTab, row: Record<string, unknown>): FormValues {
  const v: FormValues = {};
  for (const f of CATALOGUE_CONFIG[tab].fields) {
    const x = row[f.name];
    v[f.name] = f.kind === 'bool' ? x === true : x == null ? '' : String(x);
  }
  return v;
}

/**
 * Validate catalogue form values and build the row to write. On update,
 * create-only fields are left out so their meaning cannot change.
 */
export function buildCatalogueRow(tab: EditableTab, values: FormValues, mode: 'insert' | 'update'):
  { ok: true; row: Record<string, string | number | boolean | null> } | { ok: false; message: string } {
  const row: Record<string, string | number | boolean | null> = {};
  for (const f of CATALOGUE_CONFIG[tab].fields) {
    if (mode === 'update' && f.createOnly) continue;
    const raw = values[f.name];
    if (f.kind === 'bool') { row[f.name] = raw === true; continue; }
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) {
      if (f.required) return { ok: false, message: `${f.label} is required.` };
      row[f.name] = null;
      continue;
    }
    if (f.kind === 'number') {
      if (!/^\d+$/.test(s) || Number(s) < (f.min ?? 0) || Number(s) > (f.max ?? Number.MAX_SAFE_INTEGER)) {
        return { ok: false, message: `${f.label} must be a whole number between ${f.min ?? 0} and ${f.max}.` };
      }
      row[f.name] = Number(s);
      continue;
    }
    if (f.kind === 'select' && f.options && !f.options.some(o => o.value === s)) {
      return { ok: false, message: `Choose a valid ${f.label.toLowerCase()}.` };
    }
    if (f.max && s.length > f.max) return { ok: false, message: `${f.label} must be ${f.max} characters or fewer.` };
    if (f.pattern && !f.pattern.test(s)) return { ok: false, message: f.patternHint ?? `${f.label} is not in the right format.` };
    row[f.name] = s;
  }
  return { ok: true, row };
}

/** Display text for a catalogue cell. */
export function cellText(f: CatalogueField, value: unknown, siteName: (id: string) => string): string {
  if (f.kind === 'bool') return value === true ? 'Yes' : 'No';
  if (value == null || value === '') return '—';
  if (f.kind === 'select') return f.options?.find(o => o.value === value)?.label ?? String(value);
  if (f.kind === 'site') return siteName(String(value));
  return String(value);
}

export function isCatalogueTab(s: string): s is CatalogueTab {
  return (CATALOGUE_TABS as readonly string[]).includes(s);
}

// ─── Job roles ──────────────────────────────────────────────────────

export interface RoleFormValues {
  title: string; description: string; role_category: string; safety_critical: boolean; department_id: string; default_site_id: string;
}
export const EMPTY_ROLE: RoleFormValues = { title: '', description: '', role_category: '', safety_critical: false, department_id: '', default_site_id: '' };

/** Validated job_roles fields (132 CHECKs). */
export function roleFields(v: RoleFormValues): { ok: true; row: Record<string, string | boolean | null> } | { ok: false; message: string } {
  const title = v.title.trim();
  if (!title) return { ok: false, message: 'Give the role a title.' };
  if (title.length > 200) return { ok: false, message: 'The title must be 200 characters or fewer.' };
  if (v.role_category.trim().length > 100) return { ok: false, message: 'The category must be 100 characters or fewer.' };
  if (v.description.trim().length > 4000) return { ok: false, message: 'The description must be 4,000 characters or fewer.' };
  return { ok: true, row: {
    title, description: v.description.trim() || null, role_category: v.role_category.trim() || null,
    safety_critical: v.safety_critical, department_id: v.department_id || null, default_site_id: v.default_site_id || null,
  } };
}

// ─── Training sessions ──────────────────────────────────────────────

export type SessionStatus = typeof SESSION_STATUSES[number];
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: 'Planned', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled',
};

/** Validate a new session. `starts`/`ends` are ISO timestamps already converted from local input. */
export function validateSession(v: { course_id: string; starts_at: string; ends_at: string; capacity: string; location: string; provider: string }):
  { ok: true; row: { course_id: string; starts_at: string; ends_at: string | null; capacity: number | null; location: string | null; provider: string | null } }
  | { ok: false; message: string } {
  if (!v.course_id) return { ok: false, message: 'Choose the course.' };
  if (!v.starts_at || Number.isNaN(Date.parse(v.starts_at))) return { ok: false, message: 'Choose when the session starts.' };
  const ends = v.ends_at && !Number.isNaN(Date.parse(v.ends_at)) ? v.ends_at : null;
  if (ends && Date.parse(ends) < Date.parse(v.starts_at)) return { ok: false, message: 'The session cannot end before it starts.' };
  const cap = intIn(v.capacity, 1, 1000);
  if (cap === 'bad') return { ok: false, message: 'Capacity must be a whole number between 1 and 1,000, or blank.' };
  if (v.location.trim().length > 300) return { ok: false, message: 'Location must be 300 characters or fewer.' };
  if (v.provider.trim().length > 200) return { ok: false, message: 'Provider must be 200 characters or fewer.' };
  return { ok: true, row: { course_id: v.course_id, starts_at: v.starts_at, ends_at: ends, capacity: cap, location: v.location.trim() || null, provider: v.provider.trim() || null } };
}

/** Attendance counts for the session summary. Facts only. */
export function attendanceSummary(rows: { status: string; training_record_id: string | null }[]) {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const passedWithoutRecord = rows.filter(r => r.status === 'passed' && !r.training_record_id).length;
  return { total: rows.length, counts, passedWithoutRecord };
}

/** A database error as a sentence for a person. The guards' own messages are already written for people. */
export function dbMessage(err: { message: string; code?: string } | null | undefined): string {
  if (!err) return 'Something went wrong. Try again.';
  if (err.code === '23505') return 'Something with that name already exists here. Choose a different name.';
  if (err.code === '42501') return err.message.includes('row-level security') ? 'You do not have permission to make this change.' : err.message;
  return err.message;
}
