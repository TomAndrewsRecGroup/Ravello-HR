import { resilientFetch } from '@/lib/http/resilient';
import type { JevAnswer, JevAnswers, JevQuestions } from './types';

// The one file that knows Jev's wire format. Pure builders and parsers
// (tested), plus one thin send.

export const JEV_DEFAULT_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_DEFAULT_MODEL = 'jev-latest';
const MAX_STATE_STRING = 4_000;
const MAX_CHOICE_OPTIONS = 255;

export function jevConfig() {
  return {
    url:   process.env.JEV_API_URL?.trim() || JEV_DEFAULT_URL,
    key:   process.env.JEV_API_KEY?.trim() || '',
    model: process.env.JEV_MODEL?.trim() || JEV_DEFAULT_MODEL,
    disabled: process.env.JEV_DISABLED === '1' || process.env.JEV_DISABLED === 'true',
  };
}

/** Bound every string in the state (never the instructions) so an
 *  8,000-character activity summary cannot push the request past the
 *  32k state limit or the 64k request limit. */
export function boundState(state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v === 'string') out[k] = v.length > MAX_STATE_STRING ? `${v.slice(0, MAX_STATE_STRING)}…` : v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = boundState(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

export function validateQuestions(questions: JevQuestions): string | null {
  const keys = Object.keys(questions);
  if (keys.length === 0) return 'no questions';
  for (const k of keys) {
    const q = questions[k];
    if (!q.instructions?.trim()) return `${k}: instructions required`;
    if (q.type === 'choice') {
      const n = Object.keys(q.criteria).length;
      if (n < 1 || n > MAX_CHOICE_OPTIONS) return `${k}: choice needs 1–${MAX_CHOICE_OPTIONS} options`;
    }
    if (q.type === 'score' && q.criteria.length < 2) return `${k}: score needs at least 2 labels`;
  }
  return null;
}

export function buildRequest(model: string, state: Record<string, unknown>, questions: JevQuestions) {
  const wire: Record<string, unknown> = {};
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul') wire[k] = { type: 'noul', instructions: q.instructions, ...(q.criteria ? { criteria: q.criteria } : {}) };
    else if (q.type === 'choice') wire[k] = { type: 'choice', instructions: q.instructions, criteria: q.criteria };
    else wire[k] = { type: 'score', instructions: q.instructions, criteria: [...q.criteria] };
  }
  return { model, state: boundState(state), questions: wire };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Parse the answers, validating every selected option against the
 *  question we asked. An option Jev did not have cannot be selected
 *  here whatever the response says. Returns null on any shape problem
 *  so the caller records the raw response and shows "no suggestion". */
export function parseResponse(payload: unknown, questions: JevQuestions): { answers: JevAnswers; model: string | null; inputTokens: number | null } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const raw = (p.answers ?? p.results ?? p) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') return null;
  const answers: JevAnswers = {};

  for (const [k, q] of Object.entries(questions)) {
    const a = raw[k] as Record<string, unknown> | undefined;
    if (!a || typeof a !== 'object') return null;
    let parsed: JevAnswer | null = null;
    if (q.type === 'noul') {
      const prob = num(a.noul) ?? num(a.probability) ?? num(a.true);
      if (prob === null) return null;
      parsed = { type: 'noul', probability: clamp01(prob) };
    } else if (q.type === 'choice') {
      const selected = typeof a.choice === 'string' ? a.choice : typeof a.selected === 'string' ? a.selected : null;
      if (!selected || !(selected in q.criteria)) return null;
      const probabilities = readProbabilities(a.probabilities, Object.keys(q.criteria));
      const confidence = num(a.confidence) ?? probabilities[selected] ?? 0;
      parsed = { type: 'choice', selected, confidence: clamp01(confidence), probabilities };
    } else {
      const labels = [...q.criteria];
      let index: number | null = null;
      if (typeof a.score === 'number') index = Math.round(a.score);
      else if (typeof a.score === 'string') index = labels.indexOf(a.score);
      if (index === null || index < 0 || index >= labels.length) return null;
      const probabilities = readProbabilities(a.probabilities, labels.map((_, i) => String(i)));
      // Label the probabilities by rubric text, not index, so a caller never has to know the order.
      const byLabel: Record<string, number> = {};
      labels.forEach((l, i) => { byLabel[l] = probabilities[String(i)] ?? 0; });
      const confidence = num(a.confidence) ?? byLabel[labels[index]] ?? 0;
      parsed = { type: 'score', selected: labels[index], index, confidence: clamp01(confidence), probabilities: byLabel };
    }
    answers[k] = parsed;
  }

  const usage = p.usage as Record<string, unknown> | undefined;
  return {
    answers,
    model: typeof p.model === 'string' ? p.model : null,
    inputTokens: num(usage?.input_tokens),
  };
}

function readProbabilities(v: unknown, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of keys) { const n = num((v as Record<string, unknown>)[k]); if (n !== null) out[k] = clamp01(n); }
  } else if (Array.isArray(v)) {
    keys.forEach((k, i) => { const n = num(v[i]); if (n !== null) out[k] = clamp01(n); });
  }
  return out;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export interface SendResult {
  status: number | null;
  payload: unknown;
  error: string | null;
  durationMs: number;
}

/** POST to Jev. Idempotent inference, so retryOnWrite is right here. */
export async function sendToJev(body: unknown, opts: { url: string; key: string; timeoutMs?: number }): Promise<SendResult> {
  const started = Date.now();
  const r = await resilientFetch(opts.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${opts.key}` },
    body: JSON.stringify(body),
  }, { vendor: 'jev', timeoutMs: opts.timeoutMs ?? 8_000, retries: 1, retryOnWrite: true });
  const durationMs = Date.now() - started;
  if (!r.response) return { status: null, payload: null, error: r.error ?? 'no response', durationMs };
  let payload: unknown = null;
  try { payload = await r.response.json(); } catch { /* recorded as a parse failure below */ }
  if (!r.response.ok) {
    const detail = payload && typeof payload === 'object' ? JSON.stringify(payload).slice(0, 300) : '';
    return { status: r.response.status, payload, error: `HTTP ${r.response.status}${detail ? ` ${detail}` : ''}`, durationMs };
  }
  return { status: r.response.status, payload, error: null, durationMs };
}
