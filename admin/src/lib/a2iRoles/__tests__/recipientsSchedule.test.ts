import { describe, it, expect } from 'vitest';
import { firstName, resolveRecipients } from '../recipients';
import { isFinalAttempt, isSendWindow, londonWeekKey, nextSendLabel } from '../schedule';

const athletes = [
  { id: 'a1', full_name: 'Sam Rivers', email: 'Sam@Example.com', company_id: 'c1' },
  { id: 'a2', full_name: 'Jo Lane', email: 'jo@example.com', company_id: 'c1' },
  { id: 'a3', full_name: 'Sam Rivers', email: 'sam@example.com ', company_id: 'c2' },   // same person, second client
  { id: 'a4', full_name: 'No Email', email: null, company_id: 'c1' },
  { id: 'a5', full_name: 'Bad Email', email: 'not-an-email', company_id: 'c1' },
];

describe('resolveRecipients', () => {
  it('all mode: every athlete with a valid email, once per person', () => {
    const r = resolveRecipients(athletes, 'all', [], []);
    expect(r.map(x => x.athleteId)).toEqual(['a1', 'a2']);
    expect(r[0]).toMatchObject({ email: 'Sam@Example.com', emailLower: 'sam@example.com', fullName: 'Sam Rivers' });
  });
  it('selected mode: only the chosen athletes', () => {
    expect(resolveRecipients(athletes, 'selected', ['a2'], []).map(x => x.athleteId)).toEqual(['a2']);
    expect(resolveRecipients(athletes, 'selected', [], [])).toEqual([]);
  });
  it('an opt-out excludes the person under every athlete row, case-insensitively', () => {
    expect(resolveRecipients(athletes, 'all', [], ['SAM@example.com']).map(x => x.athleteId)).toEqual(['a2']);
  });
  it('first name', () => {
    expect(firstName('  Sam   Rivers ')).toBe('Sam');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});

describe('schedule — Thursday 3pm UK, in GMT and BST', () => {
  it('GMT (winter): 15:00 UTC is 3pm UK', () => {
    expect(isSendWindow(new Date('2026-10-29T14:59:00Z'))).toBe(false);
    expect(isSendWindow(new Date('2026-10-29T15:00:00Z'))).toBe(true);
  });
  it('BST (summer): 14:00 UTC is 3pm UK', () => {
    expect(isSendWindow(new Date('2026-07-02T13:59:00Z'))).toBe(false);
    expect(isSendWindow(new Date('2026-07-02T14:00:00Z'))).toBe(true);
  });
  it('not on any other day', () => {
    expect(isSendWindow(new Date('2026-10-28T15:30:00Z'))).toBe(false);   // Wednesday
    expect(isSendWindow(new Date('2026-10-30T15:30:00Z'))).toBe(false);   // Friday
  });
  it('the final-attempt alert window opens at 17:30 UK', () => {
    expect(isFinalAttempt(new Date('2026-10-29T17:29:00Z'))).toBe(false);
    expect(isFinalAttempt(new Date('2026-10-29T17:30:00Z'))).toBe(true);
    expect(isFinalAttempt(new Date('2026-07-02T16:30:00Z'))).toBe(true);   // 17:30 BST
  });
  it('week key comes from the London date', () => {
    expect(londonWeekKey(new Date('2026-10-29T15:00:00Z'))).toBe('2026-W44');
    expect(londonWeekKey(new Date('2026-07-02T14:00:00Z'))).toBe('2026-W27');
    // 23:30 UTC on Thursday 2 July is 00:30 Friday in London — still W27.
    expect(londonWeekKey(new Date('2026-07-02T23:30:00Z'))).toBe('2026-W27');
  });
  it('next send label', () => {
    expect(nextSendLabel(new Date('2026-10-28T12:00:00Z'))).toBe('Thursday 29 October, 3:00pm UK time');
    expect(nextSendLabel(new Date('2026-10-29T16:00:00Z'))).toBe('Thursday 5 November, 3:00pm UK time');
  });
});
