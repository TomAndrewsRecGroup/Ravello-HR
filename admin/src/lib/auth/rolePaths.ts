// Which signed-in roles may use the admin app, and where each may go.
//
// Two roles sign in here: Core OS 360 staff (tps_admin), who may go
// anywhere, and external Health & Safety providers (hs_provider,
// migration 090/094), who may reach ONLY their workspace.
//
// Everything outside /hs is staff territory, and much of it reads with
// the service role (the (admin) layout's client list, /api/files/sign,
// most /api/admin routes). So a provider is not "staff with fewer
// menu items": the allow-list below is the whole of what they may
// request, and it is checked on every request, cached-cookie fast path
// included (lib/supabase/middleware.ts).
//
// Anchored patterns only: /^\/hs/ would also admit /hsx and
// /hs-anything, a mistake the tests pin.

export const STAFF_ROLE    = 'tps_admin';
export const PROVIDER_ROLE = 'hs_provider';

export const ADMIN_APP_ROLES: readonly string[] = [STAFF_ROLE, PROVIDER_ROLE];

const PROVIDER_PATHS: readonly RegExp[] = [
  /^\/hs(\/|$)/,
  /^\/api\/hs\//,
];

export function isAdminAppRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_APP_ROLES.includes(role);
}

/** May this role request this path at all? */
export function roleMayReach(role: string | null | undefined, pathname: string): boolean {
  if (role === STAFF_ROLE) return true;
  if (role === PROVIDER_ROLE) return PROVIDER_PATHS.some(p => p.test(pathname));
  return false;
}

/** Where a role lands after signing in, or when it asks for a page it may not see. */
export function homeFor(role: string | null | undefined): string {
  return role === PROVIDER_ROLE ? '/hs' : '/dashboard';
}
