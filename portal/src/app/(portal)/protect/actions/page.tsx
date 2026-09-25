import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import ActionButtons from '@/components/modules/ActionButtons';
import { CheckCircle2, AlertTriangle, Info, ExternalLink } from 'lucide-react';
import type { Action } from '@/lib/supabase/types';
import { groupActionsByPriority } from '@/lib/actions/priority';

export const metadata: Metadata = { title: 'Actions' };
export const revalidate = 30;

const ENTITY_LABELS: Record<string, string> = {
  requisition:     'View role',
  document:        'View document',
  ticket:          'View ticket',
  candidate:       'View candidate',
  compliance_item: 'View register',
  absence:         'View leave',
  employee:        'View employee',
};

// Paths that take an id: the entity id is appended. Paths that do
// not (lists) are used as they are.
const ENTITY_PATHS: Record<string, { base: string; withId: boolean }> = {
  requisition:     { base: '/hire/hiring',        withId: true },
  document:        { base: '/lead/documents',     withId: true },
  ticket:          { base: '/support',            withId: true },
  candidate:       { base: '/hire/hiring',        withId: true },
  compliance_item: { base: '/protect/compliance', withId: false },
  absence:         { base: '/lead/absence',       withId: false },
  employee:        { base: '/lead/employee-records', withId: false },
};

function priorityIcon(priority: Action['priority']) {
  if (priority === 'urgent' || priority === 'high') return <AlertTriangle size={14} className="flex-shrink-0" style={{ color: 'var(--danger)' }} />;
  if (priority === 'normal') return <Info size={14} className="flex-shrink-0" style={{ color: 'var(--warning)' }} />;
  return                            <Info size={14} className="flex-shrink-0" style={{ color: 'var(--blue)' }} />;
}

function priorityBadgeClass(priority: Action['priority']): string {
  if (priority === 'urgent' || priority === 'high') return 'badge-urgent';
  if (priority === 'normal') return 'badge-pending';
  return 'badge-normal';
}

interface ActionCardProps {
  action: Action;
}

function ActionCard({ action }: ActionCardProps) {
  const target = action.related_entity_type ? ENTITY_PATHS[action.related_entity_type] : undefined;
  const entityPath = target
    ? `${target.base}${target.withId && action.related_entity_id ? `/${action.related_entity_id}` : ''}`
    : null;

  const entityLabel = action.related_entity_type
    ? (ENTITY_LABELS[action.related_entity_type] ?? 'View')
    : null;

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        {priorityIcon(action.priority)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              {action.title}
            </p>
            <span className={`badge ${priorityBadgeClass(action.priority)}`}>
              {action.priority}
            </span>
          </div>
          {action.description && (
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
              {action.description}
            </p>
          )}
          {entityPath && entityLabel && (
            <a
              href={entityPath}
              className="inline-flex items-center gap-1 text-xs mt-2"
              style={{ color: 'var(--purple)' }}
            >
              {entityLabel} <ExternalLink size={10} />
            </a>
          )}
          <ActionButtons actionId={action.id} />
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  actions: Action[];
  accent: string;
}

function PrioritySection({ title, actions, accent }: SectionProps) {
  if (actions.length === 0) return null;
  return (
    <section>
      <h2
        className="font-display font-semibold text-sm mb-3 flex items-center gap-2"
        style={{ color: 'var(--ink)' }}
      >
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: accent }}
        />
        {title}
        <span className="font-normal text-xs" style={{ color: 'var(--ink-faint)' }}>
          ({actions.length})
        </span>
      </h2>
      <div className="space-y-3">
        {actions.map(a => <ActionCard key={a.id} action={a} />)}
      </div>
    </section>
  );
}

export default async function ActionsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const now = new Date().toISOString();

  const { data: actionsData, error } = await supabase
    .from('actions')
    .select('id,created_at,updated_at,company_id,action_type,title,description,related_entity_id,related_entity_type,priority,status,dismissed_at,completed_at,dismiss_until,due_date,created_by_admin')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .or(`dismiss_until.is.null,dismiss_until.lt.${now}`)
    .order('priority')
    .order('created_at', { ascending: false });

  // If table missing or any error, treat as empty
  const actions: Action[] = error ? [] : ((actionsData ?? []) as Action[]);

  const groups = groupActionsByPriority(actions);

  return (
      <main className="portal-page flex-1">

        {actions.length === 0 ? (
          <div className="card p-12">
            <div className="empty-state">
              <CheckCircle2 size={28} style={{ color: 'var(--teal)' }} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>
                No outstanding actions
              </p>
              <p className="text-sm max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                You're up to date. Core OS 360 will add actions here as they arise.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
              {actions.length} outstanding action{actions.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-8">
              {groups.map(g => (
                <PrioritySection key={g.priority} title={g.title} actions={g.actions} accent={g.accent} />
              ))}
            </div>
          </>
        )}
      </main>
  );
}
