// Core-OS 360 capability model — the TypeScript mirror of migration 117's
// catalogue, extended by 122 (access_roles / access_capabilities / access_role_capabilities
// / legacy_role_map). Shared-dupe pair: admin and portal hold identical
// copies (scripts/check-shared-dupes.sh).
//
// The DATABASE is the authority: RLS calls has_capability(), and a UI
// check here is only ever a courtesy (hide a button the server would
// refuse anyway). tenancySql.test.ts parses 117 + 122's SQL and fails if this
// file and the seed disagree in either direction, so the two cannot
// drift.
//
// Roles resolve to capabilities. Code asks "may this user do X in this
// organisation?", never `role === 'admin'`.

export const CAPABILITIES = [
  'organisation.read', 'organisation.manage',
  'site.read', 'site.manage',
  'people.read', 'people.write',
  'hr.sensitive.read', 'hr.sensitive.write',
  'risk.read', 'risk.create', 'risk.approve',
  'incident.create', 'incident.investigate',
  'actions.assign',
  'contractors.manage',
  'documents.manage',
  'training.manage',
  'recruitment.manage',
  'billing.read', 'billing.manage',
  'consultancy.client_access', 'consultancy.manage_access',
  'broadcast.send',
  'audit.read',
  // Phase 2 (migration 122): operational H&S.
  'hazard.report', 'hazard.manage',
  'incident.read', 'incident.sensitive.read', 'incident.approve',
  'riddor.review',
  'templates.manage',
  // Phase 3 (migration 132): workforce compliance and occupational health.
  'workforce.read', 'workforce.manage', 'workforce.verify_safety_critical',
  'training.verify', 'competency.assess', 'competency.verify',
  'occupational_health.summary.read', 'occupational_health.clinical.read', 'occupational_health.manage',
  'deployment.exception.approve',
  // Phase 4 (migration 144): the asset register.
  'asset.read', 'asset.manage',
] as const;
export type Capability = typeof CAPABILITIES[number];

/** Capabilities that expose or change sensitive data. */
export const SENSITIVE_CAPABILITIES: readonly Capability[] = [
  'hr.sensitive.read', 'hr.sensitive.write', 'billing.manage', 'consultancy.manage_access', 'audit.read',
  'incident.sensitive.read', 'riddor.review',
  'occupational_health.summary.read', 'occupational_health.clinical.read', 'occupational_health.manage',
];

/** Clinical occupational health is never implied by being staff: it needs
 *  an explicit grant of this capability (SQL: has_explicit_capability). */
export const EXPLICIT_ONLY_CAPABILITIES: readonly Capability[] = ['occupational_health.clinical.read'];

export const ACCESS_ROLES = [
  'platform_super_admin', 'platform_staff',
  'consultancy_owner', 'consultant',
  'organisation_owner', 'organisation_admin', 'organisation_editor',
  'hse_manager', 'hse_advisor', 'site_manager', 'department_manager',
  'hr_manager', 'recruiter', 'employee', 'read_only',
  'occupational_health_advisor',
] as const;
export type AccessRole = typeof ACCESS_ROLES[number];

export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  platform_super_admin: 'Platform Super Admin',
  platform_staff:       'Platform Staff',
  consultancy_owner:    'Consultancy Owner',
  consultant:           'Consultant',
  organisation_owner:   'Organisation Owner',
  organisation_admin:   'Organisation Admin',
  organisation_editor:  'Organisation Editor',
  hse_manager:          'HSE Manager',
  hse_advisor:          'HSE Advisor',
  site_manager:         'Site Manager',
  department_manager:   'Department Manager',
  hr_manager:           'HR Manager',
  recruiter:            'Recruiter',
  employee:             'Employee',
  read_only:            'Read Only',
  occupational_health_advisor: 'Occupational Health Advisor',
};

/** Roles that may be GRANTED on an organisation (scope 'organisation'). */
export const ORGANISATION_ROLES: readonly AccessRole[] = ACCESS_ROLES.filter(
  r => r !== 'platform_super_admin' && r !== 'platform_staff',
);

/** Roles a consultancy owner may grant its own people on a served client. */
export const CONSULTANCY_GRANTABLE_ROLES: readonly AccessRole[] = ['consultant', 'hse_manager', 'hse_advisor', 'read_only'];

/** Grants under these roles cannot write anything (restrictive RLS guard). */
export const READ_ONLY_ROLES: readonly AccessRole[] = ['read_only'];

const ORG_ADMIN: Capability[] = [
  'organisation.read', 'organisation.manage', 'site.read', 'site.manage', 'people.read', 'people.write',
  'hr.sensitive.read', 'hr.sensitive.write', 'risk.read', 'risk.create', 'risk.approve', 'incident.create',
  'incident.investigate', 'actions.assign', 'contractors.manage', 'documents.manage', 'training.manage',
  'recruitment.manage', 'billing.read', 'audit.read', 'asset.read', 'asset.manage',
];

/** Every Phase 2 H&S capability — the roles that lead safety hold all of them. */
const HS_ALL: Capability[] = [
  'hazard.report', 'hazard.manage', 'incident.read', 'incident.sensitive.read', 'incident.approve',
  'riddor.review', 'templates.manage',
];
/** Line managers: report, triage hazards, see incidents — no medical detail, no sign-off. */
const HS_LINE: Capability[] = ['hazard.report', 'hazard.manage', 'incident.read'];

/** Phase 3: those who run workforce compliance (roles, requirements,
 *  verification, competence, time-limited exceptions). */
const WF_LEAD: Capability[] = [
  'workforce.read', 'workforce.manage', 'workforce.verify_safety_critical', 'training.verify',
  'competency.assess', 'competency.verify', 'deployment.exception.approve',
];
/** Occupational health outcomes (no clinical detail) and recording them. */
const OH_SUMMARY: Capability[] = ['occupational_health.summary.read', 'occupational_health.manage'];
/** Phase 4 (migration 144): the asset register, same split as risk.read/risk.create. */
const ASSET_ALL: Capability[] = ['asset.read', 'asset.manage'];
const PLATFORM_ALL: Capability[] = CAPABILITIES.filter(c => !EXPLICIT_ONLY_CAPABILITIES.includes(c));

export const ROLE_CAPABILITIES: Record<AccessRole, readonly Capability[]> = {
  platform_super_admin: PLATFORM_ALL,
  platform_staff:       PLATFORM_ALL.filter(c => c !== 'billing.manage'),
  consultancy_owner: [
    'organisation.read', 'organisation.manage', 'site.read', 'site.manage', 'people.read', 'people.write',
    'risk.read', 'risk.create', 'risk.approve', 'incident.create', 'incident.investigate', 'actions.assign',
    'contractors.manage', 'documents.manage', 'training.manage', 'billing.read', 'consultancy.client_access',
    'consultancy.manage_access', 'broadcast.send', 'audit.read', ...HS_ALL, ...WF_LEAD, ...ASSET_ALL,
  ],
  consultant: [
    'organisation.read', 'site.read', 'people.read', 'risk.read', 'risk.create', 'risk.approve',
    'incident.create', 'incident.investigate', 'actions.assign', 'contractors.manage', 'documents.manage',
    'training.manage', 'consultancy.client_access', ...HS_ALL, ...WF_LEAD, ...ASSET_ALL,
  ],
  organisation_owner: [...ORG_ADMIN, 'billing.manage', ...HS_ALL, ...WF_LEAD, ...OH_SUMMARY],
  organisation_admin: [...ORG_ADMIN, ...HS_ALL, ...WF_LEAD, ...OH_SUMMARY],
  organisation_editor: [
    'organisation.read', 'site.read', 'people.read', 'people.write', 'risk.read', 'risk.create',
    'incident.create', 'actions.assign', 'documents.manage', 'training.manage', 'recruitment.manage',
    ...HS_LINE, 'workforce.read', ...ASSET_ALL,
  ],
  hse_manager: [
    'organisation.read', 'site.read', 'site.manage', 'people.read', 'risk.read', 'risk.create', 'risk.approve',
    'incident.create', 'incident.investigate', 'actions.assign', 'contractors.manage', 'documents.manage',
    'training.manage', ...HS_ALL, ...WF_LEAD, ...OH_SUMMARY, ...ASSET_ALL,
  ],
  hse_advisor: [
    'organisation.read', 'site.read', 'people.read', 'risk.read', 'risk.create', 'incident.create',
    'incident.investigate', 'actions.assign', 'documents.manage', ...HS_LINE,
    'workforce.read', 'training.verify', 'competency.assess', ...ASSET_ALL,
  ],
  site_manager: [
    'organisation.read', 'site.read', 'site.manage', 'people.read', 'risk.read', 'risk.create',
    'incident.create', 'incident.investigate', 'actions.assign', 'contractors.manage', ...HS_LINE,
    'training.verify', 'competency.assess', ...ASSET_ALL,
  ],
  department_manager: ['organisation.read', 'site.read', 'people.read', 'risk.read', 'incident.create', 'actions.assign', ...HS_LINE,
    'training.verify', 'competency.assess', 'asset.read'],
  hr_manager: [
    'organisation.read', 'site.read', 'people.read', 'people.write', 'hr.sensitive.read', 'hr.sensitive.write',
    'documents.manage', 'training.manage', 'actions.assign', 'audit.read',
    'hazard.report', 'incident.read', 'incident.sensitive.read',
    'workforce.read', 'workforce.manage', 'training.verify', 'occupational_health.summary.read',
  ],
  recruiter: ['organisation.read', 'people.read', 'recruitment.manage', 'hazard.report'],
  employee:  ['organisation.read', 'site.read', 'incident.create', 'hazard.report'],
  read_only: ['organisation.read', 'site.read', 'people.read', 'risk.read', 'incident.read', 'workforce.read', 'asset.read'],
  occupational_health_advisor: [
    'organisation.read', 'site.read', 'people.read', 'hazard.report', 'workforce.read',
    'occupational_health.summary.read', 'occupational_health.clinical.read', 'occupational_health.manage',
  ],
};

/** The legacy user_role a person holds at HOME → catalogue role.
 *  A consultancy's own admins/editors are its owner/consultants. */
export function homeRoleKey(legacyRole: string, organisationType: string | null | undefined): AccessRole | null {
  const consultancy = organisationType === 'consultancy';
  switch (legacyRole) {
    case 'tps_admin':     return 'platform_super_admin';
    case 'tps_client':    return 'read_only';
    case 'hs_provider':   return 'read_only';
    case 'client_admin':  return consultancy ? 'consultancy_owner' : 'organisation_admin';
    case 'client_editor': return consultancy ? 'consultant' : 'organisation_editor';
    case 'client_user':   return 'employee';
    default:              return null;
  }
}

export function roleHasCapability(role: AccessRole | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(cap) ?? false;
}

export function isAccessRole(v: unknown): v is AccessRole {
  return typeof v === 'string' && (ACCESS_ROLES as readonly string[]).includes(v);
}
