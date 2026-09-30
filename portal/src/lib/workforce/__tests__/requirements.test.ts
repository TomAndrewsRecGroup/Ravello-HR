import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ruleState, groupRules, countInForce, suggestReplaced, replaceableRules, earliestEndDate, addDaysIso,
  validateRuleForm, buildRuleInsert, EMPTY_RULE_FORM, optionsForType, referenceTitle, catalogueFor,
  DELIVERY_METHODS, OH_REQUIREMENT_CATEGORIES, CATALOGUE_CONFIG, buildCatalogueRow, emptyValues, rowToValues, cellText,
  validateSession, attendanceSummary, RULE_SCOPE_COLUMN, roleFields, EMPTY_ROLE, SESSION_STATUS_LABELS, dbMessage, type RuleRow, type CatalogueOption,
} from '../requirements';

const TODAY = '2026-09-28';
const rule = (p: Partial<RuleRow>): RuleRow => ({
  id: 'r', requirement_type: 'training', reference_id: 'c1', reference_key: null, min_level_id: null, mandatory: true,
  safety_critical: false, evidence_required: false, allow_elearning: true, validity_months: null, grace_days: 0,
  effective_from: null, effective_until: null, superseded_by: null, source_type: 'manual', notes: null,
  created_at: '2026-01-01T00:00:00Z', ...p,
});

describe('ruleState', () => {
  it('reads the dates the way the database guard does', () => {
    expect(ruleState(rule({}), TODAY)).toBe('draft');
    expect(ruleState(rule({ effective_from: TODAY }), TODAY)).toBe('in_force');
    expect(ruleState(rule({ effective_from: '2026-01-01', effective_until: TODAY }), TODAY)).toBe('in_force');
    expect(ruleState(rule({ effective_from: '2026-01-01', effective_until: '2026-09-27' }), TODAY)).toBe('history');
    expect(ruleState(rule({ effective_from: '2026-10-01' }), TODAY)).toBe('scheduled');
    // activated and replaced before it ever started
    expect(ruleState(rule({ effective_from: '2026-10-01', effective_until: '2026-09-30' }), TODAY)).toBe('history');
  });
});

describe('groupRules', () => {
  it('groups and orders by type, scheduled by start, history newest end first', () => {
    const rules = [
      rule({ id: 'a', requirement_type: 'ppe', effective_from: '2026-01-01' }),
      rule({ id: 'b', requirement_type: 'training', effective_from: '2026-01-01' }),
      rule({ id: 'c' }),
      rule({ id: 'd', effective_from: '2026-12-01' }),
      rule({ id: 'e', effective_from: '2026-11-01' }),
      rule({ id: 'f', effective_from: '2025-01-01', effective_until: '2025-06-01' }),
      rule({ id: 'g', effective_from: '2025-01-01', effective_until: '2026-01-01' }),
    ];
    const g = groupRules(rules, TODAY);
    expect(g.in_force.map(r => r.id)).toEqual(['b', 'a']);
    expect(g.draft.map(r => r.id)).toEqual(['c']);
    expect(g.scheduled.map(r => r.id)).toEqual(['e', 'd']);
    expect(g.history.map(r => r.id)).toEqual(['g', 'f']);
    expect(countInForce(rules, TODAY)).toBe(2);
  });
});

describe('replacement', () => {
  it('suggests the in-force rule with the same type and item, never an ended one', () => {
    const orig = rule({ id: 'o', effective_from: '2026-01-01' });
    const ended = rule({ id: 'x', effective_from: '2025-01-01', effective_until: '2026-12-31' });
    const other = rule({ id: 'p', reference_id: 'c2', effective_from: '2026-01-01' });
    const draft = rule({ id: 'd' });
    const all = [orig, ended, other, draft];
    expect(suggestReplaced(draft, all, TODAY)?.id).toBe('o');
    expect(replaceableRules(all, TODAY).map(r => r.id)).toEqual(['o', 'p']);
    expect(suggestReplaced(rule({ id: 'd2', reference_id: 'zzz' }), all, TODAY)).toBeNull();
  });
  it('never allows a retroactive end', () => {
    expect(earliestEndDate(TODAY)).toBe('2026-09-27');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('validateRuleForm', () => {
  const base = { ...EMPTY_RULE_FORM, requirement_type: 'training' as const, reference_id: 'c1' };
  it('accepts a draft and a start of today or later', () => {
    const d = validateRuleForm(base, TODAY);
    expect(d.ok && d.effective_from).toBe(null);
    const f = validateRuleForm({ ...base, mode: 'from', effective_from: TODAY }, TODAY);
    expect(f.ok && f.effective_from).toBe(TODAY);
  });
  it('refuses a start in the past', () => {
    expect(validateRuleForm({ ...base, mode: 'from', effective_from: '2026-09-27' }, TODAY).ok).toBe(false);
  });
  it('requires the catalogue item, a level for competency, a key for documents', () => {
    expect(validateRuleForm({ ...base, reference_id: '' }, TODAY).ok).toBe(false);
    expect(validateRuleForm({ ...base, requirement_type: 'competency' }, TODAY).ok).toBe(false);
    const c = validateRuleForm({ ...base, requirement_type: 'competency', min_level_id: 'l4' }, TODAY);
    expect(c.ok && c.fields.min_level_id).toBe('l4');
    expect(validateRuleForm({ ...base, requirement_type: 'document', reference_id: '' }, TODAY).ok).toBe(false);
    const d = validateRuleForm({ ...base, requirement_type: 'document', reference_key: 'Driving licence copy' }, TODAY);
    expect(d.ok && d.fields.reference_id).toBe(null);
    expect(d.ok && d.fields.reference_key).toBe('Driving licence copy');
  });
  it('drops a stale level on non-competency types and bounds the numbers', () => {
    const t = validateRuleForm({ ...base, min_level_id: 'l4' }, TODAY);
    expect(t.ok && t.fields.min_level_id).toBe(null);
    expect(validateRuleForm({ ...base, validity_months: '0' }, TODAY).ok).toBe(false);
    expect(validateRuleForm({ ...base, validity_months: '1.5' }, TODAY).ok).toBe(false);
    expect(validateRuleForm({ ...base, grace_days: '91' }, TODAY).ok).toBe(false);
    const ok = validateRuleForm({ ...base, validity_months: '36', grace_days: '14' }, TODAY);
    expect(ok.ok && [ok.fields.validity_months, ok.fields.grace_days]).toEqual([36, 14]);
  });
  it('builds an insert on the right scope column with no stamped columns', () => {
    const v = validateRuleForm(base, TODAY);
    if (!v.ok) throw new Error();
    const row = buildRuleInsert('site_requirements', 's1', 'org', v.fields, null);
    expect(row).toMatchObject({ company_id: 'org', site_id: 's1', effective_from: null, source_type: 'manual' });
    expect(row).not.toHaveProperty('created_by');
    expect(row).not.toHaveProperty('id');
    expect(RULE_SCOPE_COLUMN.role_requirements).toBe('role_id');
  });
});

describe('catalogue options', () => {
  const byTable: Record<string, CatalogueOption[]> = {
    credential_types: [
      { id: 'q', title: 'NVQ', kind: 'qualification', company_id: null, active: true },
      { id: 'l', title: 'HGV', kind: 'licence', company_id: 'org', active: true },
      { id: 'l2', title: 'Old', kind: 'licence', company_id: 'org', active: false },
    ],
  };
  it('filters credentials by kind and hides inactive items', () => {
    expect(optionsForType('licence', byTable).map(o => o.id)).toEqual(['l']);
    expect(optionsForType('qualification', byTable).map(o => o.id)).toEqual(['q']);
    expect(optionsForType('document', byTable)).toEqual([]);
    expect(catalogueFor('permit')).toEqual({ table: 'credential_types', kind: 'permit' });
    expect(catalogueFor('training')).toEqual({ table: 'training_courses', kind: null });
  });
  it('still names an inactive item on an existing rule', () => {
    expect(referenceTitle({ requirement_type: 'licence', reference_id: 'l2', reference_key: null }, byTable)).toBe('Old (inactive)');
    expect(referenceTitle({ requirement_type: 'document', reference_id: null, reference_key: 'Passport' }, byTable)).toBe('Passport');
  });
});

describe('vocabularies not in vocab.ts are pinned to migration 133', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../../../../supabase/migrations/133_workforce_requirements.sql'), 'utf8');
  const listAfter = (marker: string) => {
    const i = sql.indexOf(marker);
    const seg = sql.slice(i, sql.indexOf('))', i));
    return [...seg.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  };
  it('delivery methods', () => {
    const vals = listAfter('delivery_method IN');
    expect(new Set(vals)).toEqual(new Set(DELIVERY_METHODS));
  });
  it('occupational health categories', () => {
    expect(new Set(listAfter('category IN'))).toEqual(new Set(OH_REQUIREMENT_CATEGORIES));
  });
});

describe('buildCatalogueRow', () => {
  it('validates required fields, numbers and formats', () => {
    expect(buildCatalogueRow('courses', emptyValues('courses'), 'insert').ok).toBe(false);
    const ok = buildCatalogueRow('courses', { ...emptyValues('courses'), title: ' Manual handling ', validity_months: '36', safety_critical: true }, 'insert');
    expect(ok.ok && ok.row).toMatchObject({ title: 'Manual handling', validity_months: 36, safety_critical: true, delivery_method: 'internal', provider: null });
    expect(buildCatalogueRow('courses', { ...emptyValues('courses'), title: 'x', validity_months: '601' }, 'insert').ok).toBe(false);
    expect(buildCatalogueRow('checks', { key: 'DBS', title: 'DBS' }, 'insert').ok).toBe(false);
    expect(buildCatalogueRow('checks', { key: 'dbs_check', title: 'DBS' }, 'insert').ok).toBe(true);
    expect(buildCatalogueRow('courses', { ...emptyValues('courses'), title: 'x', delivery_method: 'webinar' }, 'insert').ok).toBe(false);
  });
  it('never updates a create-only field', () => {
    const r = buildCatalogueRow('credentials', { kind: 'licence', title: 'HGV' }, 'update');
    expect(r.ok && r.row).not.toHaveProperty('kind');
    const c = buildCatalogueRow('checks', { key: 'dbs', title: 'DBS' }, 'update');
    expect(c.ok && c.row).not.toHaveProperty('key');
  });
  it('round-trips a row into form values', () => {
    const v = rowToValues('health', { title: 'Audiometry', category: 'audiometry', frequency_months: 12, safety_critical: false });
    expect(v).toEqual({ title: 'Audiometry', category: 'audiometry', frequency_months: '12', safety_critical: false });
    expect(Object.keys(CATALOGUE_CONFIG)).toHaveLength(8);
  });
  // Phase 21 (Core-OS 360 Completion Programme, C3.8): a course may
  // optionally name which published E-Learning marketplace item
  // delivers it, purely a reference link — never required, never
  // validated against a live table here (the FK does that).
  it('courses config carries an optional learning_content_id field', () => {
    const field = CATALOGUE_CONFIG.courses.fields.find(f => f.name === 'learning_content_id');
    expect(field).toMatchObject({ kind: 'learning_content', column: true });
    expect(field?.required).toBeFalsy();
    expect(CATALOGUE_CONFIG.courses.select).toContain('learning_content_id');
  });
});

describe('cellText', () => {
  const siteName = (id: string) => (id === 's1' ? 'Head Office' : '—');
  const learningContentTitle = (id: string) => (id === 'lc1' ? 'Manual Handling Video' : '—');
  it('resolves a site id to its name', () => {
    const field = CATALOGUE_CONFIG.inductions.fields.find(f => f.kind === 'site')!;
    expect(cellText(field, 's1', siteName)).toBe('Head Office');
  });
  it('resolves a learning_content id to its title, given the lookup', () => {
    const field = { name: 'learning_content_id', label: 'E-Learning content', kind: 'learning_content' as const };
    expect(cellText(field, 'lc1', siteName, learningContentTitle)).toBe('Manual Handling Video');
  });
  it('shows a dash for a learning_content value with no lookup supplied', () => {
    const field = { name: 'learning_content_id', label: 'E-Learning content', kind: 'learning_content' as const };
    expect(cellText(field, 'lc1', siteName)).toBe('—');
  });
  it('shows a dash for an unset value regardless of kind', () => {
    const field = { name: 'learning_content_id', label: 'E-Learning content', kind: 'learning_content' as const };
    expect(cellText(field, null, siteName, learningContentTitle)).toBe('—');
  });
});

describe('sessions', () => {
  const v = { course_id: 'c', starts_at: '2026-10-01T09:00:00.000Z', ends_at: '', capacity: '', location: '', provider: '' };
  it('validates a session', () => {
    expect(validateSession({ ...v, course_id: '' }).ok).toBe(false);
    expect(validateSession({ ...v, ends_at: '2026-10-01T08:00:00.000Z' }).ok).toBe(false);
    expect(validateSession({ ...v, capacity: '0' }).ok).toBe(false);
    const ok = validateSession({ ...v, capacity: '12', location: ' Room 1 ' });
    expect(ok.ok && ok.row).toMatchObject({ capacity: 12, location: 'Room 1', ends_at: null, provider: null });
  });
  it('counts attendance and passes still waiting for a record', () => {
    const s = attendanceSummary([
      { status: 'passed', training_record_id: null }, { status: 'passed', training_record_id: 't' },
      { status: 'failed', training_record_id: null }, { status: 'attended', training_record_id: null },
    ]);
    expect(s).toEqual({ total: 4, counts: { passed: 2, failed: 1, attended: 1 }, passedWithoutRecord: 1 });
  });
});

describe('roleFields', () => {
  it('requires a title and blanks optional links to null', () => {
    expect(roleFields(EMPTY_ROLE).ok).toBe(false);
    const r = roleFields({ ...EMPTY_ROLE, title: ' Fitter ', safety_critical: true });
    expect(r.ok && r.row).toEqual({ title: 'Fitter', description: null, role_category: null, safety_critical: true, department_id: null, default_site_id: null });
    expect(roleFields({ ...EMPTY_ROLE, title: 'x'.repeat(201) }).ok).toBe(false);
  });
  it('labels every session status', () => {
    expect(Object.keys(SESSION_STATUS_LABELS).sort()).toEqual(['cancelled', 'completed', 'confirmed', 'planned']);
  });
});

describe('dbMessage', () => {
  it('turns a duplicate into a sentence and passes guard messages through', () => {
    expect(dbMessage({ message: 'duplicate key', code: '23505' })).toMatch(/already exists/);
    expect(dbMessage({ message: 'A requirement cannot start in the past', code: '23514' })).toBe('A requirement cannot start in the past');
    expect(dbMessage({ message: 'new row violates row-level security policy', code: '42501' })).toMatch(/permission/);
  });
});
