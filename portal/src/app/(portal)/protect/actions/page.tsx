import type { Metadata } from 'next';
import Link from 'next/link';
import ActionButtons from '@/components/modules/ActionButtons';
import AcknowledgeBroadcastButton from '@/components/modules/AcknowledgeBroadcastButton';
import { CheckCircle2, AlertTriangle, Info, ExternalLink, ShieldCheck } from 'lucide-react';
import type { Action } from '@/lib/supabase/types';
import { groupActionsByPriority } from '@/lib/actions/priority';
import { ACTION_OPEN_STATUSES } from '@/lib/ui/statusMaps';
import { getSafetyContext, orgDirectory, param, todayIso } from '@/lib/hs/safetyContext';
import { docPath, hazardPath, incidentPath } from '@/lib/hs/safetyVocab';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import SafetyActionCard, { type SafetyAction } from './SafetyActionCard';

export const metadata: Metadata = { title: 'Actions' };
export const dynamic = 'force-dynamic';

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

/** Corrective actions raised from a safety record (125): they carry the
 *  verification workflow and are shown in their own view. */
const SAFETY_SOURCES = ['incident', 'investigation', 'hazard', 'risk_assessment', 'method_statement', 'coshh_assessment', 'riddor_review'] as const;
const VIEWS = [
  { key: 'mine',    label: 'Mine' },
  { key: 'verify',  label: 'Awaiting my verification' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'review',  label: 'Effectiveness review due' },
  { key: 'all',     label: 'All' },
] as const;
type View = typeof VIEWS[number]['key'];
const LIMIT = 500;

type OpenAction = Action & { source_type: string | null };

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
  acknowledgedBroadcastIds: ReadonlySet<string>;
}

function ActionCard({ action, acknowledgedBroadcastIds }: ActionCardProps) {
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
          {action.created_by_admin === true && (
            <AcknowledgeBroadcastButton actionId={action.id} acknowledged={acknowledgedBroadcastIds.has(action.id)} />
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
  acknowledgedBroadcastIds: ReadonlySet<string>;
}

function PrioritySection({ title, actions, accent, acknowledgedBroadcastIds }: SectionProps) {
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
        {actions.map(a => <ActionCard key={a.id} action={a} acknowledgedBroadcastIds={acknowledgedBroadcastIds} />)}
      </div>
    </section>
  );
}

export default async function ActionsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  const { supabase, companyId, userId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  const canAssign = ctx.can('actions.assign');
  const requested = param(sp, 'safety');
  const view: View = (VIEWS.some(v => v.key === requested) ? requested : 'mine') as View;
  const today = todayIso();
  const now = new Date().toISOString();

  const me = userId ?? '00000000-0000-0000-0000-000000000000';
  let sq = supabase.from('actions').select('id, company_id, title, description, status, priority, action_class, due_date, assigned_to, verifier_id, created_by, completed_by, completed_at, verification_required, evidence_required, completion_evidence, verification_comments, verification_rejection_reason, verification_rejected_at, verified_by, verified_at, effectiveness_review_required, effectiveness_review_date, effectiveness_outcome, effectiveness_notes, additional_action_required, effectiveness_reviewed_by, source_type, source_id', { count: 'exact' })
    .eq('company_id', companyId).in('source_type', [...SAFETY_SOURCES]);
  if (view === 'mine') sq = sq.eq('assigned_to', me).in('status', [...ACTION_OPEN_STATUSES]);
  else if (view === 'verify') {
    sq = sq.eq('status', 'awaiting_verification');
    if (!canAssign) sq = sq.eq('verifier_id', me);
  } else if (view === 'overdue') sq = sq.in('status', ['active', 'in_progress']).lt('due_date', today);
  else if (view === 'review') sq = sq.eq('status', 'complete').eq('effectiveness_review_required', true).is('effectiveness_outcome', null);

  const [{ data: actionsData, error }, safetyRes, dir] = await Promise.all([
    supabase
      .from('actions')
      .select('id,created_at,updated_at,company_id,action_type,title,description,related_entity_id,related_entity_type,priority,status,dismissed_at,completed_at,dismiss_until,due_date,created_by_admin,source_type')
      .eq('company_id', companyId)
      // Open = active, in progress or awaiting verification (125).
      .in('status', [...ACTION_OPEN_STATUSES])
      .or(`dismiss_until.is.null,dismiss_until.lt.${now}`)
      .order('priority')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    sq.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(LIMIT),
    orgDirectory(supabase),
  ]);

  // Safety-sourced actions live in the view above; the priority groups
  // hold everything else that is still open.
  const safetySet = new Set<string>(SAFETY_SOURCES);
  const allOpen: OpenAction[] = error ? [] : ((actionsData ?? []) as OpenAction[]);
  const actions: Action[] = allOpen.filter(a => !a.source_type || !safetySet.has(a.source_type));
  const groups = groupActionsByPriority(actions);

  // Which broadcast-raised actions on this page the signed-in user has
  // already acknowledged (206) — a plain by-id-list read under the
  // caller's own RLS, never a chained embed.
  const broadcastActionIds = actions.filter(a => a.created_by_admin === true).map(a => a.id);
  const { data: ackRows } = broadcastActionIds.length && userId
    ? await supabase.from('broadcast_acknowledgements').select('action_id').eq('acknowledged_by', userId).in('action_id', broadcastActionIds).limit(500)
    : { data: [] as { action_id: string }[] };
  const acknowledgedBroadcastIds = new Set((ackRows ?? []).map(r => r.action_id));

  const safety = (safetyRes.data ?? []) as unknown as (SafetyAction & { source_id: string | null })[];
  const idsOf = (t: string) => [...new Set(safety.filter(a => a.source_type === t && a.source_id).map(a => a.source_id as string))];
  const none = Promise.resolve({ data: [] as Record<string, unknown>[] });
  const [incs, invs, hazs, ras, rams, coshh, riddors, files] = await Promise.all([
    idsOf('incident').length ? supabase.from('hs_incidents').select('id, incident_number').in('id', idsOf('incident')).limit(LIMIT) : none,
    idsOf('investigation').length ? supabase.from('incident_investigations').select('id, reference, incident_id').in('id', idsOf('investigation')).limit(LIMIT) : none,
    idsOf('hazard').length ? supabase.from('hazards').select('id, reference').in('id', idsOf('hazard')).limit(LIMIT) : none,
    idsOf('risk_assessment').length ? supabase.from('risk_assessments').select('id, reference, version').in('id', idsOf('risk_assessment')).limit(LIMIT) : none,
    idsOf('method_statement').length ? supabase.from('method_statements').select('id, reference, version').in('id', idsOf('method_statement')).limit(LIMIT) : none,
    idsOf('coshh_assessment').length ? supabase.from('coshh_assessments').select('id, reference, version').in('id', idsOf('coshh_assessment')).limit(LIMIT) : none,
    idsOf('riddor_review').length ? supabase.from('riddor_reviews').select('id, incident_id').in('id', idsOf('riddor_review')).limit(LIMIT) : none,
    safety.length ? supabase.from('hs_files').select('id, entity_id, storage_path, file_name').eq('entity_type', 'action').in('entity_id', safety.map(a => a.id)).limit(LIMIT) : none,
  ]);
  const rows = (r: { data: unknown }) => (r.data ?? []) as Record<string, string | number>[];
  const sourceOf = (a: { source_type: string | null; source_id: string | null }): { label: string; href: string | null } | null => {
    if (!a.source_id) return null;
    const find = (r: { data: unknown }) => rows(r).find(x => x.id === a.source_id);
    switch (a.source_type) {
      case 'incident': { const x = find(incs); return { label: `Incident ${x?.incident_number ?? ''}`.trim(), href: incidentPath(a.source_id) }; }
      case 'investigation': { const x = find(invs); return { label: `Investigation ${x?.reference ?? ''}`.trim(), href: x ? incidentPath(String(x.incident_id)) : null }; }
      case 'riddor_review': { const x = find(riddors); return { label: 'RIDDOR review', href: x ? incidentPath(String(x.incident_id)) : null }; }
      case 'hazard': { const x = find(hazs); return { label: `Hazard ${x?.reference ?? ''}`.trim(), href: hazardPath(a.source_id) }; }
      case 'risk_assessment': { const x = find(ras); return { label: x ? `Risk assessment ${x.reference} v${x.version}` : 'Risk assessment', href: docPath('risk_assessment', a.source_id) }; }
      case 'method_statement': { const x = find(rams); return { label: x ? `RAMS ${x.reference} v${x.version}` : 'RAMS', href: docPath('method_statement', a.source_id) }; }
      case 'coshh_assessment': { const x = find(coshh); return { label: x ? `COSHH ${x.reference} v${x.version}` : 'COSHH assessment', href: docPath('coshh_assessment', a.source_id) }; }
      default: return null;
    }
  };
  const names = Object.fromEntries(dir.map(p => [p.user_id, p.full_name]));
  const fileRows = (files.data ?? []) as { id: string; entity_id: string; storage_path: string; file_name: string }[];

  return (
      <main className="portal-page flex-1 space-y-8">

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <ShieldCheck size={16} style={{ color: 'var(--teal)' }} /> Safety corrective actions
            </h2>
            <nav className="flex flex-wrap gap-1 ml-auto" aria-label="Safety action views">
              {VIEWS.map(v => (
                <Link key={v.key} href={`/protect/actions?safety=${v.key}`} className={v.key === view ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
                  aria-current={v.key === view ? 'page' : undefined}>{v.label}</Link>
              ))}
            </nav>
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Actions raised from hazards, risk assessments, RAMS, COSHH, incidents and investigations. Open → In progress → Awaiting verification → Verified complete.
          </p>
          {(safetyRes.count ?? 0) > LIMIT && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing {LIMIT} of {safetyRes.count}.</p>}
          {safety.length === 0 ? (
            <SafetyEmpty icon={ShieldCheck} title={view === 'verify' ? 'Nothing waiting for your verification' : view === 'overdue' ? 'No overdue safety actions' : view === 'review' ? 'No effectiveness reviews due' : 'No safety actions here'}
              text={view === 'mine' ? 'Corrective actions assigned to you from an incident, hazard or assessment will appear here.' : 'Corrective actions are raised from the incident, hazard or assessment they fix.'} />
          ) : (
            <div className="space-y-3">
              {safety.map(a => (
                <SafetyActionCard key={a.id} action={a} userId={userId} canAssign={canAssign} names={names} source={sourceOf(a)}
                  files={fileRows.filter(f => f.entity_id === a.id)} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Other outstanding actions</h2>
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
                <PrioritySection key={g.priority} title={g.title} actions={g.actions} accent={g.accent} acknowledgedBroadcastIds={acknowledgedBroadcastIds} />
              ))}
            </div>
          </>
        )}
        </section>
      </main>
  );
}
