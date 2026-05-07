// Legacy activate route — kept ONLY so older emails (sent before
// the /auth/set-password rollout) still work. New emails point
// straight at /auth/set-password.
//
// Behaviour: if a token is present, forward to the new page so the
// user gets the direct password-form experience. If no token,
// bounce to login with a clear reason. We do NOT do any env-var
// validation here — that's the new page's job and it surfaces a
// proper in-page error instead of a useless redirect-to-login.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { token?: string; purpose?: string };
}

export default function ActivatePage({ searchParams }: Props) {
  const token = searchParams.token?.trim();
  if (!token) {
    redirect('/auth/login?error=invalid');
  }
  // Forward to the new direct-password page. The token + URL stays
  // 7 days valid; the new page renders a password form instead of
  // bouncing through a magic-link redirect chain. purpose=reset
  // flag is dropped — both invite and reset converge on the same
  // 'set a password and sign in' UX.
  redirect(`/auth/set-password?token=${encodeURIComponent(token)}`);
}
