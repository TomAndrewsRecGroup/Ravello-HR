import type { SupabaseClient } from '@supabase/supabase-js';

// Write a platform_events row for something that has no row of its own
// (shared-dupe pair: admin and portal).
//
// Sessions cannot insert into platform_events (096 revokes it), so the
// caller passes a SERVICE-ROLE client, and therefore the CALLER is the
// boundary: it must have verified the session and taken the company
// from it, never from the request body. The one portal use is the
// Manatal move-stage route, which used to insert staff notifications
// under the client's own session — an insert the policy refused, so the
// recruiter was never told.
//
// Strings from a request body are bounded here so a payload cannot
// carry a novel into the outbox.

export interface EmitEventInput {
  companyId:   string | null;
  entityType:  string;
  entityId?:   string | null;
  eventType:   'created' | 'updated' | 'deleted';
  payload?:    Record<string, unknown>;
  actorId?:    string | null;
  actorKind:   'system' | 'staff' | 'provider' | 'client';
  /** Set to make the emit idempotent; a repeat is silently dropped. */
  dedupeKey?:  string;
}

const MAX_STRING = 300;

export function boundPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string') out[k] = v.slice(0, MAX_STRING);
    else if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (v !== undefined) out[k] = JSON.parse(JSON.stringify(v).slice(0, 4_000));
  }
  return out;
}

export async function emitEvent(service: SupabaseClient, input: EmitEventInput): Promise<{ error: string | null }> {
  const row = {
    company_id:  input.companyId,
    entity_type: input.entityType,
    entity_id:   input.entityId ?? null,
    event_type:  input.eventType,
    payload:     boundPayload(input.payload ?? {}),
    actor_id:    input.actorId ?? null,
    actor_kind:  input.actorKind,
    dedupe_key:  input.dedupeKey ?? null,
  };
  const { error } = input.dedupeKey
    ? await service.from('platform_events').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    : await service.from('platform_events').insert(row);
  if (error) console.error('[events.emit] insert failed', { entity: input.entityType, error: error.message });
  return { error: error?.message ?? null };
}
