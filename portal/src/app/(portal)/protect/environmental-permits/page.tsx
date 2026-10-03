import type { Metadata } from 'next';
import { FileCheck } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ENVIRONMENTAL_PERMIT_STATUS_LABELS, PERMIT_CONDITION_STATUS_LABELS, type EnvironmentalPermitStatus, type PermitConditionStatus } from '@/lib/hs/vocab';
import type { EnvironmentalPermit, PermitCondition } from '@/lib/hs/types';
import LinkedActionBadge, { type LinkedActionSummary } from '@/components/hs/LinkedActionBadge';

export const metadata: Metadata = { title: 'Environmental Permits' };
export const dynamic = 'force-dynamic';

// Mirrors admin's EnvironmentalPermitsClient.tsx colour maps exactly.
const PERMIT_STATUS_COLOUR: Record<EnvironmentalPermitStatus, string> = {
  active:      'var(--teal)',
  expired:     'var(--red)',
  surrendered: 'var(--ink-faint)',
  revoked:     'var(--red)',
};

const CONDITION_STATUS_COLOUR: Record<PermitConditionStatus, string> = {
  current:          'var(--teal)',
  evidence_due:     'var(--gold)',
  overdue:          'var(--red)',
  breach_recorded:  'var(--red)',
  review_required:  'var(--gold)',
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Read-only. permit_conditions.status is a factual record, never a
// compliance verdict — see CLAUDE.md's standing rule against
// certification language.
export default async function ProtectEnvironmentalPermitsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: permits, error: permitsError } = await supabase.from('environmental_permits')
    .select('id, company_id, site_id, permit_type, permit_number, issuing_authority, issued_on, expires_on, status, created_by, created_at, updated_at')
    .eq('company_id', companyId).order('permit_type').limit(500);
  const permitRows = (permits ?? []) as EnvironmentalPermit[];
  const permitIds = permitRows.map(p => p.id);

  const { data: conditions, error: condError } = permitIds.length > 0
    ? await supabase.from('permit_conditions')
        .select('id, environmental_permit_id, company_id, condition_text, review_frequency, next_review_due, status, last_evidence_at, created_by, created_at, updated_at')
        .in('environmental_permit_id', permitIds).order('next_review_due').limit(500)
    : { data: [] as PermitCondition[], error: null };
  const condRows = (conditions ?? []) as PermitCondition[];

  // UI/UX cross-linking pass (2026-10-03): mirrors admin's own permits
  // page fix — a condition moved to breach_recorded/review_required
  // raises a real corrective action (environmentalRules.ts's own
  // rule, source_type='environmental_permit_condition',
  // source_id=the CONDITION's own id).
  const conditionIds = condRows.map(c => c.id);
  const { data: linkedActions } = conditionIds.length > 0
    ? await supabase.from('actions')
        .select('id, title, status, priority, due_date, verification_required, verified_at, source_id')
        .eq('company_id', companyId).eq('source_type', 'environmental_permit_condition').in('source_id', conditionIds).limit(500)
    : { data: [] as (LinkedActionSummary & { source_id: string })[] };
  const linkedActionRows = (linkedActions ?? []) as (LinkedActionSummary & { source_id: string })[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {(permitsError || condError) && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Permits could not be loaded. Refresh to try again.</p>}
      {permitRows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><FileCheck size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No environmental permits on file</p></div></div>
      ) : (
        <div className="space-y-4">
          {permitRows.map(p => (
            <div key={p.id} className="card p-5 space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong>{p.permit_type}</strong>
                {p.permit_number && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{p.permit_number}</span>}
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Expires {fmt(p.expires_on)}</span>
                <span className="ml-auto badge" style={{ color: PERMIT_STATUS_COLOUR[p.status] }}>{ENVIRONMENTAL_PERMIT_STATUS_LABELS[p.status]}</span>
              </div>
              {condRows.filter(c => c.environmental_permit_id === p.id).map(c => {
                const action = linkedActionRows.find(a => a.source_id === c.id) ?? null;
                return (
                <div key={c.id} className="rounded-md p-3 text-sm space-y-2" style={{ background: 'var(--surface-soft)' }}>
                  <p>{c.condition_text}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    <span>Next review: {fmt(c.next_review_due)}</span>
                    <span className="badge" style={{ color: CONDITION_STATUS_COLOUR[c.status] }}>{PERMIT_CONDITION_STATUS_LABELS[c.status]}</span>
                  </div>
                  {action && <LinkedActionBadge action={action} />}
                </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
