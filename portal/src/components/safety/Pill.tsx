// A status pill in the design system's colours. Tone, not colour, is
// chosen by the caller, so a status reads the same on every page.
export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'muted';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-alt)', fg: 'var(--ink-soft)' },
  info:    { bg: 'rgba(59,111,255,0.12)', fg: 'var(--blue)' },
  good:    { bg: 'rgba(20,184,166,0.14)', fg: 'var(--teal)' },
  warn:    { bg: 'rgba(191,143,40,0.16)', fg: 'var(--gold)' },
  bad:     { bg: 'rgba(217,68,68,0.12)', fg: 'var(--red)' },
  muted:   { bg: 'var(--surface-soft)', fg: 'var(--ink-faint)' },
};
export default function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  const t = TONES[tone];
  return <span className="badge whitespace-nowrap" title={title} style={{ background: t.bg, color: t.fg }}>{children}</span>;
}

/** The usual tone for a status word, shared by every safety list. */
export function toneFor(status: string | null | undefined): Tone {
  switch (status) {
    case 'draft': case 'identified': case 'reported': case 'in_progress': case 'active': case 'open': return 'info';
    case 'pending_review': case 'pending_approval': case 'triage': case 'awaiting_verification': case 'awaiting_actions':
    case 'under_investigation': case 'under_assessment': case 'monitoring': case 'review_required': case 'potentially_reportable': return 'warn';
    case 'changes_requested': case 'review_due': case 'confirmed_reportable': case 'overdue': return 'bad';
    case 'approved': case 'controlled': case 'complete': case 'closed': case 'confirmed_not_reportable': case 'reported_to_hse': return 'good';
    case 'superseded': case 'archived': case 'cancelled': case 'dismissed': case 'not_reviewed': case 'retired': return 'muted';
    default: return 'neutral';
  }
}
