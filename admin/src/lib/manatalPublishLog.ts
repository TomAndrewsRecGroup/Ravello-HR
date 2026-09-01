// A durable record of what a Manatal publish actually did.
//
// The route reports its reason to the panel, which renders it in red
// under the button. That serves whoever is looking at the screen in
// that second and nobody afterwards — and the first role published
// through this route failed twice with no one able to say why, because
// the only record was text that had already gone.
//
// Writing it down is not instrumentation for its own sake. "The button
// was pressed" and "the job was updated" are different facts, and until
// now the system could not tell them apart after the event.

import { createClient } from '@supabase/supabase-js';

export interface PublishStep {
  requisitionId: string;
  actorId?:      string | null;
  /** `precondition` covers every exit BEFORE Manatal is contacted:
   *  a denied session, a rate limit, a missing API key, a failed read,
   *  an unlinked client. Those were silent in the first cut of this
   *  file, and the first real failure landed in exactly that gap — an
   *  empty log then means "nothing ran", which is indistinguishable
   *  from "the button was never pressed". */
  step:          'precondition' | 'create' | 'update' | 'publish';
  ok:            boolean;
  manatalJobId?: string | null;
  httpStatus?:   number | null;
  message?:      string | null;
  /** The args handed to Manatal, so a wrong field is visible after the
   *  fact rather than reconstructed from whichever code was deployed. */
  sent?:         unknown;
}

/**
 * Best-effort, and deliberately so.
 *
 * The publish either happened or it did not by the time this is
 * called; a logging failure cannot change that and must never turn a
 * successful publish into an error the operator sees. It is awaited
 * rather than fired and forgotten because the serverless function can
 * be frozen the moment the response is returned, which would drop the
 * write silently — the exact failure this file exists to prevent.
 */
export async function logPublishStep(step: PublishStep): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;

    const sb = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await sb.from('manatal_publish_log').insert({
      requisition_id: step.requisitionId,
      actor_id:       step.actorId ?? null,
      step:           step.step,
      ok:             step.ok,
      manatal_job_id: step.manatalJobId ?? null,
      http_status:    step.httpStatus ?? null,
      // Bounded: a vendor can return a whole HTML error page, and a
      // megabyte of markup in a diagnostic row helps nobody.
      message:        step.message ? String(step.message).slice(0, 4_000) : null,
      sent:           step.sent ?? null,
    });
    // Reported, not thrown. A caller that knows the write failed can
    // say "no diagnostics were recorded" instead of leaving an empty
    // table to be read as "nothing happened".
    return !error;
  } catch {
    // Swallowed on purpose — see the doc comment above.
    return false;
  }
}
