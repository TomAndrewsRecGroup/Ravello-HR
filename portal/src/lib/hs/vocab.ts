// Health & Safety vocabularies. Each tuple mirrors a CHECK list in
// migrations 094/095; vocab.test.ts reads the SQL and fails if either
// side gains a value the other lacks (the statusMaps discipline: a
// string the database refuses is checked by nothing until a 23514).

export const HS_SCOPES = ['register', 'documents', 'training', 'audits', 'incidents'] as const;
export type HsScope = typeof HS_SCOPES[number];
export const HS_SCOPE_LABELS: Record<HsScope, string> = {
  register:  'Register & visits',
  documents: 'Documents',
  training:  'Training',
  audits:    'Audits',
  incidents: 'Incidents',
};

export const HS_PROVIDER_TYPES = ['consultancy', 'training', 'inspection', 'other'] as const;
export type HsProviderType = typeof HS_PROVIDER_TYPES[number];
export const HS_PROVIDER_TYPE_LABELS: Record<HsProviderType, string> = {
  consultancy: 'H&S consultancy',
  training:    'Training provider',
  inspection:  'Inspection body',
  other:       'Other',
};

export const HS_ACCESS_LEVELS = ['read', 'write'] as const;
export type HsAccessLevel = typeof HS_ACCESS_LEVELS[number];
export const HS_ACCESS_LEVEL_LABELS: Record<HsAccessLevel, string> = {
  read:  'View only',
  write: 'View and record',
};

export const HS_ASSIGNMENT_STATUSES = ['active', 'suspended', 'ended'] as const;
export type HsAssignmentStatus = typeof HS_ASSIGNMENT_STATUSES[number];
export const HS_ASSIGNMENT_STATUS_LABELS: Record<HsAssignmentStatus, string> = {
  active:    'Active',
  suspended: 'Suspended',
  ended:     'Ended',
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

export const HS_COMPLETION_OUTCOMES = ['pass', 'pass_with_actions', 'fail'] as const;
export type HsCompletionOutcome = typeof HS_COMPLETION_OUTCOMES[number];
export const HS_COMPLETION_OUTCOME_LABELS: Record<HsCompletionOutcome, string> = {
  pass:              'Pass',
  pass_with_actions: 'Pass, actions raised',
  fail:              'Fail',
};

// Register categories. Anything starting hs_ is H&S (the generated
// compliance_items.domain column says so); the legacy 'health_safety'
// is also H&S. Not a CHECK yet — the category CHECK lands after the
// deploy, once every writer uses these.
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
  provider_access:     'Access',
};
