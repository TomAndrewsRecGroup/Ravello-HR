// What we call a candidate, and what we are willing to call them TO
// THEIR FACE.
//
// THE FAILURE THIS PREVENTS
//
// The pipeline needs a label for every applicant, including ones Manatal
// holds no name for, so it manufactured one:
//
//     const fullName = candidate?.full_name ?? `Manatal candidate ${id}`;
//
// That string is then passed to the referral email, which takes the
// first whitespace-delimited token as the greeting. The result is
// "Hi Manatal," — sent to a real stranger, in the operator's name, over
// a partner referral link. The review queue's Approve button makes it
// likelier still: the placeholder is PERSISTED to candidates.full_name
// and read back, so a human pressing Approve sends it.
//
// So the two concerns are separated here. A placeholder is a fine label
// on an internal screen; it must never reach a greeting. `greetingName`
// is the only thing the email is allowed to use, and it fails closed to
// "Hi there," which is always acceptable.

/** Label for a candidate Manatal gave no name for.
 *
 *  Worded so it is obviously not a person on the admin screens that show
 *  it, and so `isPlaceholderName` can recognise it later. */
export function placeholderName(manatalCandidateId: string): string {
  return `Unnamed applicant (Manatal ${manatalCandidateId})`;
}

/** Is this a label we invented rather than a name somebody has?
 *
 *  Matches the current form AND the original `Manatal candidate <id>`,
 *  because rows written before this existed are still read back by the
 *  Approve path. A guard that only knows the new shape would let every
 *  old row through — which is the only way this bug can still fire. */
export function isPlaceholderName(value: string | null | undefined): boolean {
  const s = (value ?? '').trim();
  return /^Unnamed applicant \(Manatal\b/i.test(s) || /^Manatal candidate\b/i.test(s);
}

/**
 * The name to greet somebody by, or undefined for "Hi there,".
 *
 * Rejects, in order: nothing, a placeholder, and any first token that is
 * not plausibly a given name. That last rule is what stops
 * "Hi 163544005," and "Hi john@example.com," — job boards do put an
 * address or a reference in the name field, and an email addressed to a
 * reference number is worse than one addressed to nobody in particular.
 *
 * Job-board applicants also arrive SHOUTING ("AARON KASANAMA"), so an
 * all-capitals token is title-cased rather than sent as a shout.
 */
export function greetingName(fullName: string | null | undefined): string | undefined {
  const raw = (fullName ?? '').trim();
  if (!raw) return undefined;
  if (isPlaceholderName(raw)) return undefined;

  const token = raw.split(/\s+/)[0];

  // A letter, then letters/apostrophes/hyphens: "Frank", "O'Brien",
  // "Jean-Luc", "Ayensu". Not "Mr.", not "J", not "07887133134",
  // not "frank.k.ayensu@gmail.com".
  if (!/^\p{L}[\p{L}'’-]+$/u.test(token)) return undefined;

  return /^\p{Lu}+$/u.test(token)
    ? token.charAt(0) + token.slice(1).toLowerCase()
    : token;
}
