// Who the referral email is allowed to greet, and how.
//
// This email goes to a stranger, in the operator's name, carrying a
// partner's application link. Getting the name wrong is not cosmetic —
// it is the difference between a credible referral and something that
// reads as a bot, on the one path where the recipient never asked to
// hear from us.
//
// The live names below are verbatim from the Adzuna applicants on job
// 4324606 (read 2026-08-28).

import { describe, expect, it } from 'vitest';
import { greetingName, isPlaceholderName, placeholderName } from '../candidateName';

describe('greetingName — real applicants', () => {
  it('greets the live applicants by their first name', () => {
    expect(greetingName('Pala Nanda Kumar Reddy')).toBe('Pala');
    expect(greetingName('Frank Kwabena Ayensu')).toBe('Frank');
  });

  it('title-cases a SHOUTING name rather than shouting back', () => {
    // Job boards routinely deliver these in capitals.
    expect(greetingName('AARON KASANAMA')).toBe('Aaron');
    expect(greetingName('MARY')).toBe('Mary');
  });

  it('keeps names that are not plain ASCII words', () => {
    expect(greetingName("Siobhán O'Brien")).toBe('Siobhán');
    expect(greetingName('Jean-Luc Picard')).toBe('Jean-Luc');
    expect(greetingName('Łukasz Nowak')).toBe('Łukasz');
  });
});

describe('greetingName — everything that must fall back to "Hi there,"', () => {
  it('refuses the placeholder we invent for unnamed applicants', () => {
    // THE BUG. The pipeline needs a label for an applicant Manatal has
    // no name for, and that label was passed straight to the greeting:
    // "Hi Manatal,". The review queue's Approve button makes it likelier
    // still, because the placeholder is persisted and read back.
    expect(greetingName(placeholderName('163544005'))).toBeUndefined();
    expect(greetingName('Manatal candidate 163544005')).toBeUndefined();
  });

  it('refuses a reference number or a phone number in the name field', () => {
    expect(greetingName('163544005')).toBeUndefined();
    expect(greetingName('07887133134 Reddy')).toBeUndefined();
  });

  it('refuses an email address in the name field', () => {
    // Some boards put the address there when the applicant leaves the
    // name blank. "Hi frank.k.ayensu@gmail.com," is worse than "Hi there,".
    expect(greetingName('frank.k.ayensu@gmail.com')).toBeUndefined();
    expect(greetingName('nandareddy1949@gmail.com Reddy')).toBeUndefined();
  });

  it('refuses a title, an initial, and empty input', () => {
    expect(greetingName('Mr. John Smith')).toBeUndefined();  // "Hi Mr.,"
    expect(greetingName('J Smith')).toBeUndefined();          // "Hi J,"
    expect(greetingName('')).toBeUndefined();
    expect(greetingName('   ')).toBeUndefined();
    expect(greetingName(null)).toBeUndefined();
    expect(greetingName(undefined)).toBeUndefined();
  });
});

describe('isPlaceholderName', () => {
  it('recognises the current form and the original one', () => {
    // Rows written before this module existed are still read back by the
    // Approve path. A guard that only knew the new shape would let every
    // one of them through, which is the only way the bug can still fire.
    expect(isPlaceholderName(placeholderName('1'))).toBe(true);
    expect(isPlaceholderName('Manatal candidate 163544005')).toBe(true);
  });

  it('does not mistake a real person for a placeholder', () => {
    expect(isPlaceholderName('Frank Kwabena Ayensu')).toBe(false);
    expect(isPlaceholderName('Manatalia Rossi')).toBe(false);
    expect(isPlaceholderName(null)).toBe(false);
  });

  it('names the candidate id so the row is traceable', () => {
    expect(placeholderName('163544005')).toContain('163544005');
  });
});
