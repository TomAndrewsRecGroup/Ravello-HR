import { DEPLOYMENT_STATUS_COLOURS, DEPLOYMENT_STATUS_LABELS, REQUIREMENT_STATUS_COLOURS, REQUIREMENT_STATUS_LABELS,
  type DeploymentStatus, type RequirementStatus } from '@/lib/workforce/vocab';

// The status is always shown as WORDS plus colour (WCAG 1.4.1: colour is
// never the only signal).

export function DeploymentBadge({ status, size = 'md' }: { status: DeploymentStatus; size?: 'sm' | 'md' }) {
  const c = DEPLOYMENT_STATUS_COLOURS[status] ?? 'var(--ink-faint)';
  return (
    <span className="badge" style={{ color: c, borderColor: c, background: 'var(--surface)', fontWeight: 600,
      fontSize: size === 'sm' ? 11 : 12, border: '1px solid', whiteSpace: 'nowrap' }}>
      {DEPLOYMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function RequirementBadge({ status }: { status: RequirementStatus }) {
  const c = REQUIREMENT_STATUS_COLOURS[status] ?? 'var(--ink-faint)';
  return (
    <span className="badge" style={{ color: c, borderColor: c, background: 'var(--surface)', fontSize: 11, border: '1px solid', whiteSpace: 'nowrap' }}>
      {REQUIREMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}
