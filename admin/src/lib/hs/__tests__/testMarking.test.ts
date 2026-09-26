import { describe, expect, it } from 'vitest';
import { markBuiltInTest, sanitiseAnswers, type HsTestQuestion } from '../testMarking';

const QUESTIONS: HsTestQuestion[] = [
  { id: 'q1', prompt: 'Raise the alarm first?', options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }], correct_option_id: 'a' },
  { id: 'q2', prompt: 'Use the lift in a fire?', options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }], correct_option_id: 'b' },
  { id: 'q3', prompt: 'Fire extinguisher colour for water?', options: [{ id: 'a', label: 'Red' }, { id: 'b', label: 'Blue' }, { id: 'c', label: 'Black' }], correct_option_id: 'a' },
];

describe('markBuiltInTest', () => {
  it('scores a full pass at 100', () => {
    const r = markBuiltInTest(QUESTIONS, { q1: 'a', q2: 'b', q3: 'a' });
    expect(r).toEqual({ score: 100, correctCount: 3, totalCount: 3 });
  });

  it('scores a partial answer set correctly, rounding to the nearest whole percent', () => {
    const r = markBuiltInTest(QUESTIONS, { q1: 'a', q2: 'a', q3: 'a' }); // 2/3 correct
    expect(r).toEqual({ score: 67, correctCount: 2, totalCount: 3 });
  });

  it('an unanswered question counts as wrong, never throws', () => {
    const r = markBuiltInTest(QUESTIONS, { q1: 'a' });
    expect(r).toEqual({ score: 33, correctCount: 1, totalCount: 3 });
  });

  it('no questions scores 0/0, never divides by zero', () => {
    expect(markBuiltInTest([], { q1: 'a' })).toEqual({ score: 0, correctCount: 0, totalCount: 0 });
  });

  it('sanitiseAnswers drops anything that is not a real option id for that question — a forged answer never counts as correct', () => {
    const clean = sanitiseAnswers(QUESTIONS, { q1: 'a', q2: 'z', q3: 123 as unknown as string, extra: 'a' });
    expect(clean).toEqual({ q1: 'a' });
    // proves it: marking the forged payload directly never accidentally credits q2/q3
    expect(markBuiltInTest(QUESTIONS, { q1: 'a', q2: 'z', q3: 123 as unknown as string })).toEqual({ score: 33, correctCount: 1, totalCount: 3 });
  });

  it('a null/undefined answers object marks everything wrong rather than throwing', () => {
    expect(markBuiltInTest(QUESTIONS, null)).toEqual({ score: 0, correctCount: 0, totalCount: 3 });
    expect(markBuiltInTest(QUESTIONS, undefined)).toEqual({ score: 0, correctCount: 0, totalCount: 3 });
  });
});
