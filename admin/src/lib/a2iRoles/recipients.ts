// Who receives the Thursday role email. The ONE place recipients are
// decided, and it reads athletes rows only — there is no free-text
// address anywhere in this feature, which is what makes "no other
// person ever gets it" true by construction rather than by care.

export interface AthleteForRecipients {
  id:         string;
  full_name:  string | null;
  email:      string | null;
  company_id: string | null;
}

export interface Recipient {
  athleteId:  string;
  email:      string;
  emailLower: string;
  fullName:   string;
  companyId:  string | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normaliseEmail(e: string | null | undefined): string | null {
  const t = (e ?? '').trim();
  if (!t || t.length > 254 || !EMAIL_RE.test(t)) return null;
  return t;
}

export function resolveRecipients(
  athletes: AthleteForRecipients[],
  mode: 'all' | 'selected',
  selectedAthleteIds: Iterable<string>,
  optedOutEmails: Iterable<string>,
): Recipient[] {
  const selected = new Set(selectedAthleteIds);
  const optedOut = new Set([...optedOutEmails].map(e => e.toLowerCase()));
  const seen = new Set<string>();
  const out: Recipient[] = [];

  for (const a of athletes) {
    if (mode === 'selected' && !selected.has(a.id)) continue;
    const email = normaliseEmail(a.email);
    if (!email) continue;
    const lower = email.toLowerCase();
    if (optedOut.has(lower)) continue;
    // The same person under two referring clients gets ONE email.
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({
      athleteId:  a.id,
      email,
      emailLower: lower,
      fullName:   (a.full_name ?? '').trim(),
      companyId:  a.company_id,
    });
  }
  return out;
}

export function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}
