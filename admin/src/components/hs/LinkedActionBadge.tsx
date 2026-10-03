import { ACTION_STATUS_LABELS, ACTION_PRIORITY_LABELS, type ActionPriority } from '@/lib/ui/statusMaps';

// UI/UX cross-linking pass (2026-10-03): the universal action-linking
// fix the admin audit-detail page already got (a finding's raised
// action shown with its real live status/priority/due date, not an
// opaque "Action raised" badge) factored out here so every sibling
// page that raises an action via a `resulting_action_id`/
// `corrective_action_id` column can show the SAME real thing, rather
// than each growing its own copy of this rendering. Shared-dupe pair
// with the portal mirror.

export interface LinkedActionSummary {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  verification_required: boolean;
  verified_at: string | null;
}

export const ACTION_STATUS_COLOUR: Record<string, string> = {
  active: 'var(--gold)', in_progress: 'var(--blue)', awaiting_verification: 'var(--gold)',
  complete: 'var(--teal)', dismissed: 'var(--ink-faint)', cancelled: 'var(--ink-faint)',
};

/**
 * `action` is `undefined` when no action was ever raised (the caller
 * should not render this component at all in that case) and `null`
 * when an id IS recorded but could not be resolved — a real, worth-
 * surfacing distinction (a deleted row, or one outside this session's
 * company scope), never silently treated the same as "nothing raised".
 */
export default function LinkedActionBadge({ action }: { action: LinkedActionSummary | null }) {
  if (!action) {
    return (
      <p className="text-xs" style={{ color: 'var(--red)' }}>
        A raised action's id does not resolve — it may belong to a different company or no longer exist.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs p-2 rounded-[6px]" style={{ background: 'var(--surface-alt)' }}>
      <span className="font-medium" style={{ color: 'var(--ink)' }}>{action.title}</span>
      <span className="badge" style={{ color: ACTION_STATUS_COLOUR[action.status] ?? 'var(--ink-faint)' }}>
        {ACTION_STATUS_LABELS[action.status] ?? action.status}
      </span>
      {action.priority && (
        <span style={{ color: 'var(--ink-faint)' }}>
          {ACTION_PRIORITY_LABELS[action.priority as ActionPriority] ?? action.priority} priority
        </span>
      )}
      {action.due_date && <span style={{ color: 'var(--ink-faint)' }}>due {action.due_date}</span>}
      {action.verification_required && !action.verified_at && (
        <span style={{ color: 'var(--gold)' }}>awaiting verification</span>
      )}
    </div>
  );
}
