// What a provider invite may do to an account that ALREADY exists.
//
// The provider invite route runs with the service role, which 088/093's
// profile guard exempts, so this is the whole boundary for it — the
// same job existingInvitee.ts does for client invites. The rule is
// narrow on purpose: an invite may only (re)link an account that is
// already an H&S provider login with no provider or with THIS provider.
// It never turns a client user or a staff member into a provider (that
// would strip their company and hand their login to an outside firm),
// and never moves a live login from one provider to another.

export interface ExistingProviderAccount {
  role:         string | null;
  companyId:    string | null;
  providerId:   string | null;
  /** Never signed in: the password has not been set yet. */
  neverSignedIn: boolean;
}

export type ProviderInviteDecision =
  | { ok: true; relink: boolean }
  | { ok: false; status: 409; error: string };

export function decideProviderInvite(
  existing: ExistingProviderAccount | null,
  providerId: string,
): ProviderInviteDecision {
  if (!existing) {
    return { ok: false, status: 409, error: 'An account with this email exists but has no profile. Contact support.' };
  }
  if (existing.role !== 'hs_provider' || existing.companyId !== null) {
    return {
      ok: false, status: 409,
      error: 'That email already belongs to a client or staff account, so it cannot be made a provider login. Use a different address.',
    };
  }
  if (existing.providerId && existing.providerId !== providerId) {
    return { ok: false, status: 409, error: 'That email is already a login for another provider. Revoke it there first.' };
  }
  if (existing.providerId === providerId && !existing.neverSignedIn) {
    return {
      ok: false, status: 409,
      error: 'That person already has a working login for this provider. If they have forgotten their password, reset it from Users.',
    };
  }
  // Same provider and never signed in: a resend. No provider: a revoked
  // login being given access again.
  return { ok: true, relink: existing.providerId === null };
}
