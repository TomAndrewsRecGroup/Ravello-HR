import { describe, it, expect } from 'vitest';
import { A2I_TEST_EXTRA_ADDRESS, firstName, resolveRecipients, testRecipients } from '../recipients';
import { isFinalAttempt, isSendWindow, londonWeekKey, nextSendLabel, SEND_SPREAD_MS, spreadFrom, staggerSlots } from '../schedule';

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
  it('test recipients: the staff member plus the fixed Gmail, once each', () => {
    expect(A2I_TEST_EXTRA_ADDRESS).toBe('tomandrews1240@gmail.com');
    expect(testRecipients('tom@andrews-recruitment.com')).toEqual(['tom@andrews-recruitment.com', 'tomandrews1240@gmail.com']);
    expect(testRecipients('TomAndrews1240@Gmail.com ')).toEqual(['TomAndrews1240@Gmail.com']);
    expect(testRecipients(null)).toEqual(['tomandrews1240@gmail.com']);
    expect(testRecipients('not-an-email')).toEqual(['tomandrews1240@gmail.com']);
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

describe('staggerSlots — the send spread over an hour', () => {
  const start = Date.parse('2026-11-05T15:00:00Z');
  const min = (iso: string) => (Date.parse(iso) - start) / 60_000;

  it('nobody, then one person at the start', () => {
    expect(staggerSlots(start, 0)).toEqual([]);
    expect(staggerSlots(start, 1)).toEqual(['2026-11-05T15:00:00.000Z']);
  });

  it('two people: one at the start, one an hour later', () => {
    expect(staggerSlots(start, 2).map(min)).toEqual([0, 60]);
  });

  it('17 athletes: first at 3pm, last at 4pm, evenly spaced and in order', () => {
    const slots = staggerSlots(start, 17).map(min);
    expect(slots).toHaveLength(17);
    expect(slots[0]).toBe(0);
    expect(slots[16]).toBe(60);
    const gaps = slots.slice(1).map((m, i) => m - slots[i]);
    for (const g of gaps) expect(g).toBeCloseTo(3.75, 2);
  });

  it('a send starting late is squeezed in before the last cron tick (17:50 UTC)', () => {
    expect(spreadFrom(Date.parse('2026-11-05T15:00:00Z'))).toBe(SEND_SPREAD_MS);
    expect(spreadFrom(Date.parse('2026-06-04T14:00:00Z'))).toBe(SEND_SPREAD_MS);   // BST: 3pm UK
    expect(spreadFrom(Date.parse('2026-11-05T17:30:00Z'))).toBe(20 * 60_000);
    expect(spreadFrom(Date.parse('2026-11-05T18:00:00Z'))).toBe(0);
  });
});
