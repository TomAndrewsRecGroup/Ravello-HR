// Health & Safety vocabularies. Each tuple mirrors a CHECK list in
// migrations 094/095; vocab.test.ts reads the SQL and fails if either
// side gains a value the other lacks (the statusMaps discipline: a
// string the database refuses is checked by nothing until a 23514).

// A named subject-area for a piece of evidence (hs_files.entity_type is
// validated against hs_scope_for_entity(), which this mirrors for
// display; it is no longer used to gate who may see what — 105 removed
// the provider grants that were the only thing scopes gated).
export const HS_SCOPES = ['register', 'documents', 'training', 'audits', 'incidents'] as const;
export type HsScope = typeof HS_SCOPES[number];
export const HS_SCOPE_LABELS: Record<HsScope, string> = {
  register:  'Register & visits',
  documents: 'Documents',
  training:  'Training',
  audits:    'Audits',
  incidents: 'Incidents',
};

export const HS_ACTIVITY_TYPES = [
  'site_visit', 'advice_call', 'fire_drill', 'ssip_submission', 'inspection', 'meeting', 'other',
] as const;
export type HsActivityType = typeof HS_ACTIVITY_TYPES[number];
export const HS_ACTIVITY_TYPE_LABELS: Record<HsActivityType, string> = {
  site_visit:      'Site visit',
  advice_call:     'Advice call',
  fire_drill:      'Fire drill',
  ssip_submission: 'SSIP submission',
  inspection:      'Inspection',
  meeting:         'Meeting',
  other:           'Other',
};

export const HS_RECURRENCE_UNITS = ['day', 'week', 'month', 'year'] as const;
export type HsRecurrenceUnit = typeof HS_RECURRENCE_UNITS[number];

// A single audit checklist answer (110). Unlike HS_COMPLETION_OUTCOMES
// (a register item's own periodic check), an audit answer has no
// "pass with actions raised" middle state — 'fail' IS the finding, and
// raising the action is what the fail causes, not a third rating.
export const HS_AUDIT_RATINGS = ['pass', 'fail', 'na'] as const;
export type HsAuditRating = typeof HS_AUDIT_RATINGS[number];
export const HS_AUDIT_RATING_LABELS: Record<HsAuditRating, string> = {
  pass: 'Pass',
  fail: 'Fail',
  na:   'N/A',
};

export const HS_COMPLETION_OUTCOMES = ['pass', 'pass_with_actions', 'fail'] as const;
export type HsCompletionOutcome = typeof HS_COMPLETION_OUTCOMES[number];
export const HS_COMPLETION_OUTCOME_LABELS: Record<HsCompletionOutcome, string> = {
  pass:              'Pass',
  pass_with_actions: 'Pass, actions raised',
  fail:              'Fail',
};

// Register categories. Anything starting hs_ is H&S (the generated
// compliance_items.domain column says so); the legacy 'health_safety'
// is also H&S. CHECK'd live since migration 109, on the union of this
// tuple and the generic HR form's COMPLIANCE_CATEGORIES.
export const HS_REGISTER_CATEGORIES = [
  'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
  'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
  'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other',
] as const;
export type HsRegisterCategory = typeof HS_REGISTER_CATEGORIES[number];
export const HS_REGISTER_CATEGORY_LABELS: Record<HsRegisterCategory, string> = {
  hs_policy_governance:    'Policy & governance',
  hs_risk_assessment:      'Risk assessment',
  hs_fire:                 'Fire safety',
  hs_electrical:           'Electrical',
  hs_gas:                  'Gas',
  hs_lifting:              'Lifting (LOLER)',
  hs_work_equipment:       'Work equipment (PUWER)',
  hs_hazardous_substances: 'Hazardous substances (COSHH)',
  hs_water:                'Water hygiene (Legionella)',
  hs_asbestos:             'Asbestos',
  hs_first_aid:            'First aid',
  hs_construction:         'Construction (CDM)',
  hs_health_surveillance:  'Health surveillance',
  hs_care:                 'Care setting',
  hs_other:                'Other',
};

/** The domain the database derives for a category (mirror of compliance_items.domain). */
export function domainOf(category: string | null | undefined): 'hs' | 'hr' {
  const c = category ?? '';
  return c.startsWith('hs_') || c === 'health_safety' ? 'hs' : 'hr';
}

/** Label for an entity_type on the Safety Timeline. */
export const HS_ENTITY_LABELS: Record<string, string> = {
  register_item:       'Register',
  register_completion: 'Register',
  activity:            'Activity',
  site:                'Site',
  document:            'Document',
  training:            'Training',
  audit:               'Audit',
  incident:            'Incident',
};
