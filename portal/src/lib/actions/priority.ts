import { ACTION_PRIORITIES, ACTION_PRIORITY_LABELS, type ActionPriority } from '@/lib/ui/statusMaps';

// Group a client's actions for the Actions page, most urgent first.
//
// The page used to build three fixed groups (high, medium, low) and
// anything else — every Broadcast and BD-convert action, which are
// written as 'normal' — was filtered out and never rendered. Grouping
// is now driven by the one vocabulary, so a priority the database can
// hold is always shown; an unknown value lands in the last group.

export interface PriorityGroup<T> { priority: ActionPriority; title: string; accent: string; actions: T[] }

const ORDER: ActionPriority[] = ['urgent', 'high', 'normal', 'low'];
const ACCENT: Record<ActionPriority, string> = {
  urgent: 'var(--danger)', high: '#EF4444', normal: '#F59E0B', low: 'var(--blue)',
};

export function groupActionsByPriority<T extends { priority: string }>(actions: T[]): PriorityGroup<T>[] {
  const known = new Set<string>(ACTION_PRIORITIES);
  return ORDER.map(priority => ({
    priority,
    title: `${ACTION_PRIORITY_LABELS[priority]} Priority`,
    accent: ACCENT[priority],
    actions: actions.filter(a => a.priority === priority || (priority === 'low' && !known.has(a.priority))),
  }));
}
