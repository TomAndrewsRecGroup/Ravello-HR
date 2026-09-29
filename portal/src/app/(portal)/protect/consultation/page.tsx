import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { CONSULTATION_METHOD_LABELS } from '@/lib/hs/vocab';
import type { ConsultationRecord } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Worker consultation' };
export const dynamic = 'force-dynamic';

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Core-OS 360 Phase 5, Group 7 (162). Read-only, staff-managed.
export default async function ProtectConsultationPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data, error } = await supabase.from('consultation_records')
    .select('id, company_id, site_id, consultation_date, topic, method, participants, outcome_summary, linked_action_id, created_by, created_at, updated_at')
    .eq('company_id', companyId).order('consultation_date', { ascending: false }).limit(500);
  const rows = (data ?? []) as ConsultationRecord[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Consultation records could not be loaded.</p>}
      {rows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Users size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No worker consultation recorded yet.</p></div></div>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong>{r.topic}</strong>
                <span className="badge">{CONSULTATION_METHOD_LABELS[r.method]}</span>
                <span className="ml-auto text-sm" style={{ color: 'var(--ink-faint)' }}>{fmt(r.consultation_date)}</span>
              </div>
              {r.participants.length > 0 && <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Participants: {r.participants.join(', ')}</p>}
              {r.outcome_summary && <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{r.outcome_summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
