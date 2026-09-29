import type { Metadata } from 'next';
import { FileCheck } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ENVIRONMENTAL_PERMIT_STATUS_LABELS, PERMIT_CONDITION_STATUS_LABELS } from '@/lib/hs/vocab';
import type { EnvironmentalPermit, PermitCondition } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Environmental Permits' };
export const dynamic = 'force-dynamic';

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
                <span className="ml-auto badge">{ENVIRONMENTAL_PERMIT_STATUS_LABELS[p.status]}</span>
              </div>
              {condRows.filter(c => c.environmental_permit_id === p.id).map(c => (
                <div key={c.id} className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-soft)' }}>
                  <p>{c.condition_text}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    <span>Next review: {fmt(c.next_review_due)}</span>
                    <span className="badge">{PERMIT_CONDITION_STATUS_LABELS[c.status]}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
