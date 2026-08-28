// Per-candidate parameters in the partner's referral link.
//
// The referral URL is pasted by an operator and, until now, went into
// the email verbatim — so every candidate on a role got a byte-identical
// link. That is fine for a partner who only needs to know the traffic
// came from Andrews Recruitment Group, and useless for one who has to
// attribute a FEE to a specific person: reconciliation falls back to
// matching names and email addresses by hand against the partner's
// report.
//
// So the stored URL may now carry placeholders, filled at send time:
//
//     https://apply.micro1.ai/roles?ref=arg&cid={ref}&email={email}
//
// RULES THIS FILE EXISTS TO ENFORCE
//
//  1. Every substituted value is URL-ENCODED. An address containing "+",
//     a name containing a space, an apostrophe in "O'Brien" — unencoded,
//     each of them corrupts the query string, and the candidate lands on
//     a broken page holding an email that says we reviewed their CV.
//
//  2. An UNKNOWN token is refused at save time, never at send time.
//     "{firstname}" is a plausible typo for "{first_name}", and left
//     alone it would ship literally: the partner receives
//     "?name=%7Bfirstname%7D" for every candidate and nobody notices
//     until the fee reconciliation fails weeks later.
//
//  3. A known token with no value becomes EMPTY, never the literal
//     token. A candidate with no name yields "?name=", which is
//     harmless; "?name={name}" is not.

/** What an operator may write, and where each value comes from. */
export const REFERRAL_URL_TOKENS = {
  ref:          'Our id for this candidate on this role — the one to reconcile fees against',
  email:        'The candidate’s email address',
  name:         'Their full name (empty when Manatal holds none)',
  first_name:   'Their first name only',
  candidate_id: 'The Manatal candidate id',
  role:         'The role title',
  role_id:      'Our id for the role',
} as const;

export type ReferralUrlToken = keyof typeof REFERRAL_URL_TOKENS;

export const REFERRAL_URL_TOKEN_NAMES = Object.keys(REFERRAL_URL_TOKENS) as ReferralUrlToken[];

export type ReferralUrlVars = Partial<Record<ReferralUrlToken, string | null | undefined>>;

/** Matches `{token}` — letters, digits and underscores only, so a URL
 *  containing a literal brace for some other reason is left alone. */
const TOKEN_RE = /\{([A-Za-z0-9_]+)\}/g;

/** Tokens the operator wrote that we cannot fill.
 *
 *  Returned rather than thrown so the config route can name every one of
 *  them in a single message instead of one per save. */
export function findUnknownTokens(url: string): string[] {
  const unknown = new Set<string>();
  for (const m of (url ?? '').matchAll(TOKEN_RE)) {
    const name = m[1];
    if (!(REFERRAL_URL_TOKEN_NAMES as string[]).includes(name)) unknown.add(name);
  }
  return [...unknown];
}

/** Does this URL use any per-candidate parameter at all? */
export function hasTokens(url: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(url ?? '');
}

/**
 * Fill the placeholders for one candidate.
 *
 * Unknown tokens are left as they were found. They cannot reach here —
 * the config route refuses to save them — and silently deleting one
 * would turn a mistake that is visible in the link into a query
 * parameter that is merely missing.
 */
export function buildReferralUrl(template: string, vars: ReferralUrlVars): string {
  return (template ?? '').replace(TOKEN_RE, (whole, name: string) => {
    if (!(REFERRAL_URL_TOKEN_NAMES as string[]).includes(name)) return whole;
    const value = vars[name as ReferralUrlToken];
    return encodeURIComponent((value ?? '').toString().trim());
  });
}

/** Representative values, so the panel can show what the link becomes
 *  before anybody is emailed. Deliberately awkward — a space, an
 *  apostrophe and a plus address — because a preview built from tidy
 *  input teaches the operator nothing about encoding. */
export const REFERRAL_URL_SAMPLE: ReferralUrlVars = {
  ref:          '9f8c1e42-0b77-4a1e-9f5a-2c3d4e5f6a7b',
  email:        "siobhan.o'brien+jobs@example.com",
  name:         'Siobhán O’Brien',
  first_name:   'Siobhán',
  candidate_id: '163544005',
  role:         'Area Sales Manager',
  role_id:      '0cb628a6-60d0-40f3-973b-b2010753985a',
};
