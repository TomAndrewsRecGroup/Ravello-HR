/**
 * Structured audit logger for critical admin operations.
 *
 * Logs user creation, role changes, payment events, and other
 * sensitive operations in a structured JSON format for monitoring.
 *
 * In production, these logs are captured by Vercel's log drain
 * and can be forwarded to Datadog, Sentry, or similar.
 */

type AuditAction =
  | 'user.created'
  | 'user.invited'
  | 'user.invite_resent'
  | 'user.password_reset_sent'
  | 'user.deleted'
  | 'user.role_changed'
  | 'company.created'
  | 'company.archived'
  | 'company.unarchived'
  | 'company.deleted'
  | 'logo.uploaded'
  | 'logo.removed'
  // 'company.billing_setup' is distinct from 'company.created': it fires
  // when the retainer / Stripe subscription is first attached or updated,
  // which can happen well after the company row is created (e.g. a free-tier
  // client later upgrading to a paid module).
  | 'company.billing_setup'
  // 'company.manatal_synced' fires when an existing TPS client is
  // retro-pushed into Manatal via /api/admin/clients/[id]/manatal-sync
  // (one-click 'Create in Manatal' button on the client profile).
  | 'company.manatal_synced'
  // 'athlete.welcome_email_sent' fires when admin manually sends the
  // Athletes To Industry "invite to call" welcome email via
  // /api/admin/athletes/[id]/welcome-email — used for backfilling
  // athletes added before the auto-send went live.
  | 'athlete.welcome_email_sent'
  // 'email.sent' fires for every freeform email composed via
  // /api/admin/send-email (Dev Plan share, candidate share, custom
  // message). The email_log row carries the detail.
  | 'email.sent'
  | 'payment.checkout'
  | 'payment.refunded'
  | 'partner_key.used'
  | 'broadcast.sent';

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

  // Structured JSON log: picked up by Vercel log drain
  console.log(JSON.stringify(log));

  // …and the durable record (Core-OS 360 Phase 1, migration 117):
  // audit_events is append-only — no session, and not even the service
  // role, can edit or delete a row. Written through the audit_log() RPC
  // (service role only). Fire-and-forget: an audit write must never
  // fail the action it records, but a failure is logged, not swallowed.
  void persistAudit(entry);
}

async function persistAudit(entry: AuditEntry): Promise<void> {
  // Unit tests and local builds have no service key; production always
  // does (every admin API needs it), so this skips nothing live.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const { serviceClient } = await import('@/lib/automation/runs');
    const { error } = await serviceClient().rpc('audit_log', {
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
