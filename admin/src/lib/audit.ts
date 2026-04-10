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

  // Structured JSON log — picked up by Vercel log drain
  console.log(JSON.stringify(log));
}
