// What an invite may do to an account that ALREADY exists.
//
// Both invite routes create the auth user first and, when Supabase says
// the address is taken, fall back to the existing account. Until
// 2026-09-24 that fallback found the account by profiles.email — which
// any signed-in user could rewrite on their own row — and then upserted
// the inviting company and a role onto it with the service role. So:
//
//   * a client could set their profile email to someone about to be
//     invited and be made that company's admin when the invite ran;
//   * a client_admin could invite a Core OS 360 staff email and demote
//     that person to a client editor of their own company;
//   * any client_admin could pull another client's user into theirs.
//
// The account is now found in auth.users (auth_user_id_by_email, which
// nobody but the service role can call), and this decides what may
// happen to it. An existing account is NEVER moved between companies or
// out of a staff or provider role by an invite. Shared by both apps
// (scripts/check-shared-dupes.sh).

export interface ExistingAccount {
  role:          string | null;
  companyId:     string | null;
  /** An invite was sent and the password has not been set yet. */
  pendingInvite: boolean;
}

export type Inviter = 'staff' | 'client_admin';

export type InviteDecision =
  | { ok: true }
  | { ok: false; status: 409; error: string };

const PLATFORM_ROLES = new Set(['tps_admin', 'tps_client', 'hs_provider']);

export function decideExistingInvite(
  existing: ExistingAccount | null,
  targetCompanyId: string,
  inviter: Inviter,
): InviteDecision {
  if (!existing) {
    return {
      ok: false, status: 409,
      error: 'An account with this email already exists but has no profile. Contact Core OS 360 support.',
    };
  }
  if (existing.role && PLATFORM_ROLES.has(existing.role)) {
    return {
      ok: false, status: 409,
      error: 'That email belongs to a Core OS 360 staff or provider account, so it cannot be invited as a client user.',
    };
  }
  if (existing.companyId !== targetCompanyId) {
    return {
      ok: false, status: 409,
      error: existing.companyId
        ? 'That email already has an account with another organisation. Contact Core OS 360 if they need to move.'
        : 'That email already has an account that is not linked to any organisation. Contact Core OS 360 support.',
    };
  }
  // Same company. Staff may re-invite anyone in it. A client admin may
  // only RESEND a pending invite — never mint a set-password link for a
  // colleague who already has a password, which would hand them that
  // colleague's account.
  if (inviter === 'client_admin' && !existing.pendingInvite) {
    return {
      ok: false, status: 409,
      error: 'That person already has access. If they have forgotten their password they can reset it from the sign-in page.',
    };
  }
  return { ok: true };
}
