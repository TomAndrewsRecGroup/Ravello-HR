// Core-OS 360 capability model — the TypeScript mirror of migration 117's
// catalogue (access_roles / access_capabilities / access_role_capabilities
// / legacy_role_map). Shared-dupe pair: admin and portal hold identical
// copies (scripts/check-shared-dupes.sh).
//
// The DATABASE is the authority: RLS calls has_capability(), and a UI
// check here is only ever a courtesy (hide a button the server would
// refuse anyway). capabilities.test.ts parses 117's SQL and fails if this
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
] as const;
export type Capability = typeof CAPABILITIES[number];

/** Capabilities that expose or change sensitive data. */
export const SENSITIVE_CAPABILITIES: readonly Capability[] = [
  'hr.sensitive.read', 'hr.sensitive.write', 'billing.manage', 'consultancy.manage_access', 'audit.read',
];

export const ACCESS_ROLES = [
  'platform_super_admin', 'platform_staff',
  'consultancy_owner', 'consultant',
  'organisation_owner', 'organisation_admin', 'organisation_editor',
  'hse_manager', 'hse_advisor', 'site_manager', 'department_manager',
  'hr_manager', 'recruiter', 'employee', 'read_only',
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
  'recruitment.manage', 'billing.read', 'audit.read',
];

export const ROLE_CAPABILITIES: Record<AccessRole, readonly Capability[]> = {
  platform_super_admin: CAPABILITIES,
  platform_staff:       CAPABILITIES.filter(c => c !== 'billing.manage'),
  consultancy_owner: [
    'organisation.read', 'organisation.manage', 'site.read', 'site.manage', 'people.read', 'people.write',
    'risk.read', 'risk.create', 'risk.approve', 'incident.create', 'incident.investigate', 'actions.assign',
    'contractors.manage', 'documents.manage', 'training.manage', 'billing.read', 'consultancy.client_access',
    'consultancy.manage_access', 'broadcast.send', 'audit.read',
  ],
  consultant: [
    'organisation.read', 'site.read', 'people.read', 'risk.read', 'risk.create', 'risk.approve',
    'incident.create', 'incident.investigate', 'actions.assign', 'contractors.manage', 'documents.manage',
    'training.manage', 'consultancy.client_access',
  ],
  organisation_owner: [...ORG_ADMIN, 'billing.manage'],
  organisation_admin: ORG_ADMIN,
  organisation_editor: [
    'organisation.read', 'site.read', 'people.read', 'people.write', 'risk.read', 'risk.create',
    'incident.create', 'actions.assign', 'documents.manage', 'training.manage', 'recruitment.manage',
  ],
  hse_manager: [
    'organisation.read', 'site.read', 'site.manage', 'people.read', 'risk.read', 'risk.create', 'risk.approve',
    'incident.create', 'incident.investigate', 'actions.assign', 'contractors.manage', 'documents.manage',
    'training.manage',
  ],
  hse_advisor: [
    'organisation.read', 'site.read', 'people.read', 'risk.read', 'risk.create', 'incident.create',
    'incident.investigate', 'actions.assign', 'documents.manage',
  ],
  site_manager: [
    'organisation.read', 'site.read', 'site.manage', 'people.read', 'risk.read', 'risk.create',
    'incident.create', 'incident.investigate', 'actions.assign', 'contractors.manage',
  ],
  department_manager: ['organisation.read', 'site.read', 'people.read', 'risk.read', 'incident.create', 'actions.assign'],
  hr_manager: [
    'organisation.read', 'site.read', 'people.read', 'people.write', 'hr.sensitive.read', 'hr.sensitive.write',
    'documents.manage', 'training.manage', 'actions.assign', 'audit.read',
  ],
  recruiter: ['organisation.read', 'people.read', 'recruitment.manage'],
  employee:  ['organisation.read', 'site.read', 'incident.create'],
  read_only: ['organisation.read', 'site.read', 'people.read', 'risk.read'],
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
