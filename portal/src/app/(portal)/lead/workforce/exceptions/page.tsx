import type { Metadata } from 'next';
import { CalendarClock } from 'lucide-react';
import { getWorkforceContext } from '@/lib/workforce/context';
import { orgDirectory, nameOf, todayIso } from '@/lib/hs/safetyContext';
import { REQUIREMENT_CATALOGUE, type RequirementType } from '@/lib/workforce/vocab';
import { readAllPages } from '@/lib/supabase/paged';
import SafetyEmpty from '@/components/safety/SafetyEmpty';
import ExceptionsClient, { type ExceptionRow, type CatalogueItem } from './ExceptionsClient';

export const metadata: Metadata = { title: 'Requirement exceptions' };
export const dynamic = 'force-dynamic';

const LIMIT = 500;
/** People the engine calculates Safe to Deploy for (138). */
const DEPLOYABLE = ['pre_employment', 'active', 'notice', 'leave_of_absence'];

// Temporary exceptions, waivers and not-applicable decisions (spec 33,
// 34; 134 requirement_exceptions). Each one is approved, reasoned and
// ends by itself within 90 days. Granting and revoking go through the
// 134 RPCs only (deployment.exception.approve); the table has no session
// INSERT/UPDATE at all. Read: the exceptions of people I may see.
export default async function ExceptionsPage() {
  const ctx = await getWorkforceContext();
  const { supabase, companyId } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;

  const catalogueTables = Object.entries(REQUIREMENT_CATALOGUE) as [Exclude<RequirementType, 'document'>, string][];
  const uniqueTables = [...new Set(catalogueTables.map(([, t]) => t))];

  const [exceptions, people, dir, ...catalogues] = await Promise.all([
    supabase.from('requirement_exceptions')
      .select('id, person_id, requirement_type, reference_id, reference_key, kind, reason, approved_by, approved_at, valid_from, valid_until, revoked_at, revoked_by, revoke_reason', { count: 'exact' })
      .eq('company_id', companyId).order('approved_at', { ascending: false }).limit(LIMIT),
    readAllPages<{ id: string; full_name: string; lifecycle_status: string }>((from, to) =>
      supabase.from('people').select('id, full_name, lifecycle_status').eq('company_id', companyId).order('full_name').order('id').range(from, to)),
    orgDirectory(supabase),
    ...uniqueTables.map(t => supabase.from(t).select(t === 'credential_types' ? 'id, title, kind' : 'id, title').order('title').limit(500)),
  ]);

  const catalogueByTable = new Map(uniqueTables.map((t, i) => [t, (catalogues[i].data ?? []) as unknown as { id: string; title: string; kind?: string }[]]));
  const catalogue: CatalogueItem[] = [];
  for (const [type, table] of catalogueTables) {
    for (const item of catalogueByTable.get(table) ?? []) {
      if (table === 'credential_types' && item.kind !== type) continue;
      catalogue.push({ type, id: item.id, title: item.title });
    }
  }
  const personName = new Map(people.rows.map(p => [p.id, p.full_name]));
  const catName = new Map(catalogue.map(c => [`${c.type}:${c.id}`, c.title]));

  const rows: ExceptionRow[] = ((exceptions.data ?? []) as {
    id: string; person_id: string; requirement_type: RequirementType; reference_id: string | null; reference_key: string | null;
    kind: ExceptionRow['kind']; reason: string; approved_by: string; approved_at: string; valid_from: string; valid_until: string;
    revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null;
  }[]).map(e => ({
    id: e.id, person_id: e.person_id, person: personName.get(e.person_id) ?? 'A worker',
    requirement_type: e.requirement_type,
    requirement: e.reference_id ? catName.get(`${e.requirement_type}:${e.reference_id}`) ?? 'Catalogue item'
      : (e.reference_key ?? '').replace(/_/g, ' '),
    kind: e.kind, reason: e.reason,
    approved_by: nameOf(dir, e.approved_by), approved_at: e.approved_at,
    valid_from: e.valid_from, valid_until: e.valid_until,
    revoked_at: e.revoked_at, revoked_by: e.revoked_by ? nameOf(dir, e.revoked_by) : null, revoke_reason: e.revoke_reason,
  }));

  const canApprove = ctx.can('deployment.exception.approve');
  const candidates = people.rows
    .filter(p => DEPLOYABLE.includes(p.lifecycle_status) && p.id !== ctx.myPersonId)
    .map(p => ({ id: p.id, name: p.full_name }));

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="card p-4 text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
        <p>
          An exception lets someone work while one requirement is outstanding, for a set time, with a named approver and a reason.
          The person is then at best <strong>Conditionally ready</strong>, never Ready.
        </p>
        <p>Every exception ends by itself on its end date (at most 90 days) — there are no permanent overrides. Revoking one takes effect at once.</p>
      </div>

      {exceptions.error && (
        <p className="card p-3 text-sm" role="alert" style={{ color: 'var(--red)' }}>Exceptions could not be loaded: {exceptions.error.message}</p>
      )}
      {(exceptions.count ?? 0) > LIMIT && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Showing the {LIMIT} most recent of {exceptions.count}.</p>
      )}

      <ExceptionsClient rows={rows} canApprove={canApprove} people={candidates} catalogue={catalogue} today={todayIso()} />

      {rows.length === 0 && !exceptions.error && (
        <SafetyEmpty icon={CalendarClock} title="No exceptions recorded"
          text={canApprove
            ? 'Nobody is working under an exception. Grant one above only when a requirement genuinely cannot be met yet and the risk is controlled.'
            : 'Nobody you can see is working under an exception.'} />
      )}
    </main>
  );
}
