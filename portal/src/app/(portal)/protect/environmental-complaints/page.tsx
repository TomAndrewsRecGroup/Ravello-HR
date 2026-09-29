import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { COMPLAINT_SOURCE_LABELS } from '@/lib/hs/vocab';
import type { EnvironmentalComplaint } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Environmental complaints' };
export const dynamic = 'force-dynamic';

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Core-OS 360 Phase 5, Group 7 (162). Nothing here is self-certified.
export default async function ProtectEnvironmentalComplaintsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data, error } = await supabase.from('environmental_complaints')
    .select('id, company_id, site_id, received_at, source, description, investigated, outcome, linked_action_id, closed_at, created_by, created_at, updated_at')
    .eq('company_id', companyId).order('received_at', { ascending: false }).limit(500);
  const rows = (data ?? []) as EnvironmentalComplaint[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Complaints could not be loaded.</p>}
      {rows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><AlertTriangle size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No environmental complaints recorded.</p></div></div>
      ) : (
        <ul className="space-y-3">
          {rows.map(c => (
            <li key={c.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="badge">{COMPLAINT_SOURCE_LABELS[c.source]}</span>
                {c.investigated && <span className="badge" style={{ color: 'var(--teal)' }}>Investigated</span>}
                {c.closed_at && <span className="badge" style={{ color: 'var(--ink-faint)' }}>Closed</span>}
                <span className="ml-auto text-sm" style={{ color: 'var(--ink-faint)' }}>{fmt(c.received_at)}</span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{c.description}</p>
              {c.outcome && <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>Outcome: {c.outcome}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
