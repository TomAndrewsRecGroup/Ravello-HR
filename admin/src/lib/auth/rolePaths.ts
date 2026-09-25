// Which signed-in roles may use the admin app, and where they land.
//
// Until 2026-09-25 a second role, hs_provider (migration 090/094), was
// admitted here and confined to a /hs workspace. Health & Safety is now
// delivered by Core OS 360 staff, the same way HR and Recruitment
// already are, so tps_admin is the only role this app accepts. The
// hs_provider enum value stays in the database (Postgres cannot drop an
// enum value without a full type rebuild) but nothing can hold it any
// more, and no path is carved out for it.

export const STAFF_ROLE = 'tps_admin';

export const ADMIN_APP_ROLES: readonly string[] = [STAFF_ROLE];

export function isAdminAppRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_APP_ROLES.includes(role);
}

/** May this role request this path at all? Staff may go anywhere. */
export function roleMayReach(role: string | null | undefined, _pathname: string): boolean {
  return role === STAFF_ROLE;
}

/** Where a role lands after signing in. */
export function homeFor(_role: string | null | undefined): string {
  return '/dashboard';
}
