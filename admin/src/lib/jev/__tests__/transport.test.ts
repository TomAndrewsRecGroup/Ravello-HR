import { describe, expect, it } from 'vitest';
import { boundState, buildRequest, parseResponse, validateQuestions } from '../transport';
import type { JevQuestions } from '../types';

// The wire mapping, pinned. If Jev's real response differs from this,
// parseResponse returns null, the raw payload lands in jev_decisions,
// and nothing acts — that is the designed failure mode while the
// contract is confirmed against a live key.

const Q: JevQuestions = {
  yes:   { type: 'noul',   instructions: 'Is it?', criteria: { true: 'yes', false: 'no' } },
  which: { type: 'choice', instructions: 'Which?', criteria: { a: 'A', b: 'B' } },
  how:   { type: 'score',  instructions: 'How much?', criteria: ['low', 'mid', 'high'] },
};

describe('buildRequest', () => {
  it('emits model, state and per-question type/instructions/criteria', () => {
    const r = buildRequest('jev-2026-01', { title: 'x' }, Q);
    expect(r).toEqual({
      model: 'jev-2026-01', state: { title: 'x' },
      questions: {
        yes:   { type: 'noul',   instructions: 'Is it?', criteria: { true: 'yes', false: 'no' } },
        which: { type: 'choice', instructions: 'Which?', criteria: { a: 'A', b: 'B' } },
        how:   { type: 'score',  instructions: 'How much?', criteria: ['low', 'mid', 'high'] },
      },
    });
  });
  it('bounds long strings in the state, never the instructions', () => {
    const long = 'x'.repeat(10_000);
    const r = buildRequest('m', { summary: long, nested: { note: long } }, { q: { type: 'noul', instructions: long } });
    expect((r.state as { summary: string }).summary.length).toBeLessThan(4_100);
    expect(((r.state as { nested: { note: string } }).nested.note).length).toBeLessThan(4_100);
    expect((r.questions as { q: { instructions: string } }).q.instructions.length).toBe(10_000);
    expect(boundState({ n: 3, b: true, arr: [1, 2] })).toEqual({ n: 3, b: true, arr: [1, 2] });
  });
  it('refuses an empty question set, blank instructions, or a 256-option choice', () => {
    expect(validateQuestions({})).toMatch(/no questions/);
    expect(validateQuestions({ q: { type: 'noul', instructions: ' ' } })).toMatch(/instructions/);
    const big: Record<string, string> = {};
    for (let i = 0; i < 256; i++) big[`o${i}`] = `Option ${i}`;
    expect(validateQuestions({ q: { type: 'choice', instructions: 'x', criteria: big } })).toMatch(/255/);
    expect(validateQuestions(Q)).toBeNull();
  });
});

describe('parseResponse', () => {
  const payload = {
    answers: {
      yes:   { type: 'noul', noul: 0.91 },
      which: { type: 'choice', choice: 'b', confidence: 0.83, probabilities: { a: 0.17, b: 0.83 } },
      how:   { type: 'score', score: 2, confidence: 0.7, legend: { 0: 'low', 1: 'mid', 2: 'high' }, probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 } },
    },
    model: 'jev-2026-01', usage: { input_tokens: 812, output_tokens: 0 },
  };
  it('reads each answer type and labels score probabilities by rubric text', () => {
    const r = parseResponse(payload, Q)!;
    expect(r.model).toBe('jev-2026-01');
    expect(r.inputTokens).toBe(812);
    expect(r.answers.yes).toEqual({ type: 'noul', probability: 0.91 });
    expect(r.answers.which).toEqual({ type: 'choice', selected: 'b', confidence: 0.83, probabilities: { a: 0.17, b: 0.83 } });
    expect(r.answers.how).toEqual({ type: 'score', selected: 'high', index: 2, confidence: 0.7, probabilities: { low: 0.1, mid: 0.2, high: 0.7 } });
  });
  it('refuses a selected option the question did not offer', () => {
    const bad = { answers: { ...payload.answers, which: { type: 'choice', choice: 'z', confidence: 0.99 } } };
    expect(parseResponse(bad, Q)).toBeNull();
    const badScore = { answers: { ...payload.answers, how: { type: 'score', score: 7, confidence: 0.99 } } };
    expect(parseResponse(badScore, Q)).toBeNull();
  });
  it('refuses a missing answer or a non-object payload', () => {
    expect(parseResponse({ answers: { yes: payload.answers.yes } }, Q)).toBeNull();
    expect(parseResponse('nope', Q)).toBeNull();
    expect(parseResponse(null, Q)).toBeNull();
  });
  it('clamps probabilities into [0,1]', () => {
    const r = parseResponse({ answers: { ...payload.answers, yes: { type: 'noul', noul: 1.4 } } }, Q)!;
    expect(r.answers.yes).toEqual({ type: 'noul', probability: 1 });
  });
});
