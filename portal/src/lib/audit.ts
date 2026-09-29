/**
 * Structured audit logger for portal-side app-level events — the
 * portal equivalent of admin/src/lib/audit.ts, scoped to the actions
 * that only ever happen in the portal app. Not a shared-dupe pair:
 * each app's AuditAction union names only the events that app can
 * actually fire, the same reason admin's own file isn't mirrored here
 * verbatim.
 *
 * Core-OS 360 Phase 6, Group 7 (section 13, Events and Audit):
 * `consultancy.client_accessed` and `service_ledger.entry_created`
 * are named literally in the spec with a verb that doesn't match the
 * generic `<entity>.<created|updated|deleted>` shape audit_row()
 * triggers already produce for service_scope/consultancy_visit/
 * client_roadmap — so these two are explicit app-level calls at the
 * exact moment each happens, not a row trigger.
 */

type AuditAction =
  | 'consultancy.client_accessed'
  | 'service_ledger.entry_created';

interface AuditEntry {
  action: AuditAction;
  actor_id?: string;
  target_id?: string;
  target_type?: string;
  /** The organisation the event concerns, when there is exactly one. */
  organisation_id?: string | null;
  metadata?: Record<string, unknown>;
}

export function auditLog(entry: AuditEntry): void {
  const log = {
    _audit: true,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // Structured JSON log: picked up by Vercel log drain.
  console.log(JSON.stringify(log));

  // …and the durable record (Core-OS 360 Phase 1, migration 117):
  // audit_events is append-only. Written through the audit_log() RPC
  // (service role only — the same reason every read on the Command
  // Centre's portfolio-wide pages already uses the service role).
  // Fire-and-forget: an audit write must never fail the action it
  // records, but a failure is logged, not swallowed.
  void persistAudit(entry);
}

async function persistAudit(entry: AuditEntry): Promise<void> {
  // Unit tests and local builds have no service key; production
  // always does, so this skips nothing live.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const { createServiceSupabaseClient } = await import('@/lib/supabase/service');
    const { error } = await createServiceSupabaseClient().rpc('audit_log', {
      p_action:          entry.action,
      p_entity_type:     entry.target_type ?? entry.action.split('.')[0],
      p_entity_id:       entry.target_id ?? null,
      p_organisation_id: entry.organisation_id ?? null,
      p_metadata:        entry.metadata ?? {},
      p_user_id:         entry.actor_id ?? null,
    });
    if (error) console.error('[audit] audit_events write failed:', error.message);
  } catch (err) {
    console.error('[audit] audit_events write failed:', err instanceof Error ? err.message : err);
  }
}
