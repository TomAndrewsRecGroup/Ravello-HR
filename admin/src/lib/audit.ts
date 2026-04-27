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
  | 'user.role_changed'
  | 'company.created'
  | 'company.deleted'
  // 'company.billing_setup' is distinct from 'company.created': it fires
  // when the retainer / Stripe subscription is first attached or updated,
  // which can happen well after the company row is created (e.g. a free-tier
  // client later upgrading to a paid module).
  | 'company.billing_setup'
  | 'payment.checkout'
  | 'payment.refunded'
  | 'partner_key.used'
  | 'broadcast.sent';

interface AuditEntry {
  action: AuditAction;
  actor_id?: string;
  target_id?: string;
  target_type?: string;
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
}
