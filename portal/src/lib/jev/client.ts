import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRequest, jevConfig, parseResponse, sendToJev, validateQuestions } from './transport';
import { AUTO_ACT_KINDS, type DecisionKind, type JevQuestions, type JevResult } from './types';

// askJev(): the one way the platform asks Jev anything.
//
//   * Off unless JEV_API_KEY is set, JEV_DISABLED is not, and the
//     client's `ai_assist` flag is not false. Off means null, and every
//     caller treats null as "no suggestion" — the IvyLens precedent.
//   * Untrusted text (a title a provider typed, a summary a client
//     wrote) goes into `state` under a NAMED field and is framed as
//     data by the caller's instructions; it is never the instruction.
//   * Every call is a jev_decisions row — refused, failed and cached
//     ones included — with the raw response, so the wire mapping can be
//     checked from the table on day one.
//   * The same input within 30 days is answered from the table
//     (re-processing an event is free and deterministic).
//   * `gate` (default 0.8): below it the result is returned with
//     gated=true and the caller must show it as unsure, never act.
//     jevPolicy.test.ts pins that only AUTO_ACT_KINDS ever act.

export interface AskJevInput {
  kind:        DecisionKind;
  companyId:   string | null;
  entityType?: string | null;
  entityId?:   string | null;
  actor:       { id: string | null; kind: 'system' | 'staff' | 'provider' | 'client' };
  state:       Record<string, unknown>;
  questions:   JevQuestions;
  gate?:       number;
  /** The company's feature flags, when the caller already has them. */
  flags?:      Record<string, unknown> | null;
  /** Test seam. */
  transport?:  typeof sendToJev;
  now?:        () => Date;
}

export const DEFAULT_GATE = 0.8;
const CACHE_DAYS = 30;

export function inputHash(model: string, state: Record<string, unknown>, questions: JevQuestions): string {
  return createHash('sha256').update(canonical({ model, state, questions })).digest('hex');
}

/** Stable JSON: keys sorted at every level. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function jevEnabledFor(flags: Record<string, unknown> | null | undefined): boolean {
  const cfg = jevConfig();
  if (cfg.disabled || !cfg.key) return false;
  return flags?.ai_assist !== false;
}

export async function askJev(sb: SupabaseClient, input: AskJevInput): Promise<JevResult | null> {
  const cfg = jevConfig();
  if (cfg.disabled || !cfg.key) return null;

  let flags = input.flags;
  if (flags === undefined && input.companyId) {
    const { data } = await sb.from('companies').select('feature_flags').eq('id', input.companyId).maybeSingle();
    flags = (data as { feature_flags?: Record<string, unknown> } | null)?.feature_flags ?? null;
  }
  if (flags?.ai_assist === false) return null;

  const problem = validateQuestions(input.questions);
  if (problem) { console.error('[jev] invalid questions', input.kind, problem); return null; }

  const request = buildRequest(cfg.model, input.state, input.questions);
  const hash = inputHash(cfg.model, request.state as Record<string, unknown>, input.questions);
  const gate = input.gate ?? DEFAULT_GATE;
  const now = input.now ?? (() => new Date());

  // Cache: an identical question already answered recently.
  const since = new Date(now().getTime() - CACHE_DAYS * 86_400_000).toISOString();
  const { data: prior } = await sb.from('jev_decisions')
    .select('id, response, selected, confidence, model, input_tokens')
    .eq('input_hash', hash).gte('created_at', since).is('error', null).not('response', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (prior) {
    const parsed = parseResponse((prior as { response: unknown }).response, input.questions);
    if (parsed) {
      const confidence = minConfidence(parsed.answers);
      return { decisionId: (prior as { id: string }).id, answers: parsed.answers, confidence, gated: confidence !== null && confidence < gate, model: (prior as { model: string | null }).model, inputTokens: (prior as { input_tokens: number | null }).input_tokens, cached: true };
    }
  }

  const send = input.transport ?? sendToJev;
  const r = await send(request, { url: cfg.url, key: cfg.key });
  const parsed = r.error ? null : parseResponse(r.payload, input.questions);
  const error = r.error ?? (parsed ? null : 'unrecognised response shape');
  const confidence = parsed ? minConfidence(parsed.answers) : null;
  const gated = !!parsed && confidence !== null && confidence < gate;
  const selected = parsed ? Object.fromEntries(Object.entries(parsed.answers).map(([k, a]) => [k, a.type === 'noul' ? a.probability : a.selected])) : null;

  const { data: row, error: insErr } = await sb.from('jev_decisions').insert({
    kind: input.kind, company_id: input.companyId, entity_type: input.entityType ?? null, entity_id: input.entityId ?? null,
    actor_id: input.actor.id, actor_kind: input.actor.kind,
    model: parsed?.model ?? cfg.model, input_hash: hash,
    state: request.state, questions: request.questions, response: r.payload ?? null,
    selected, confidence, gated, acted: false,
    status: r.status, duration_ms: r.durationMs, error, input_tokens: parsed?.inputTokens ?? null,
  }).select('id').single();
  if (insErr) console.error('[jev] decision row not written', insErr.message);
  if (error) { console.error('[jev] call failed', input.kind, error); return null; }

  return { decisionId: (row as { id: string } | null)?.id ?? null, answers: parsed!.answers, confidence, gated, model: parsed!.model, inputTokens: parsed!.inputTokens, cached: false };
}

export function minConfidence(answers: JevResult['answers']): number | null {
  let min: number | null = null;
  for (const a of Object.values(answers)) {
    if (a.type === 'noul') continue;
    min = min === null ? a.confidence : Math.min(min, a.confidence);
  }
  return min;
}

/** Record that something acted on a decision automatically. Refuses
 *  for kinds outside AUTO_ACT_KINDS — the call site is wrong, not the data. */
export async function markActed(sb: SupabaseClient, kind: DecisionKind, decisionId: string | null, actedOn: string): Promise<boolean> {
  if (!AUTO_ACT_KINDS.has(kind)) throw new Error(`${kind} is a recommendation; it never acts`);
  if (!decisionId) return false;
  const { error } = await sb.from('jev_decisions').update({ acted: true, acted_on: actedOn }).eq('id', decisionId).select('id');
  return !error;
}
