import type { Metadata } from 'next';
import { CalendarClock } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { AUDIT_PROGRAMME_FREQUENCY_LABELS } from '@/lib/hs/vocab';
import type { AuditProgramme } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Audit programmes' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 5, Group 7 (162). Read-only, staff-managed —
// nothing here is self-certified.
export default async function ProtectAuditProgrammesPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data, error } = await supabase.from('audit_programmes')
    .select('id, company_id, name, frequency, standard_id, template_id, next_due_date, active, notes, created_by, created_at, updated_at')
    .eq('company_id', companyId).eq('active', true).order('next_due_date', { ascending: true }).limit(500);
  const rows = (data ?? []) as AuditProgramme[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Audit programmes could not be loaded.</p>}
      {rows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><CalendarClock size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No audit programmes scheduled yet.</p></div></div>
      ) : (
        <ul className="space-y-3">
          {rows.map(p => (
            <li key={p.id} className="card p-4 flex flex-wrap items-center gap-3">
              <strong>{p.name}</strong>
              <span className="badge">{AUDIT_PROGRAMME_FREQUENCY_LABELS[p.frequency]}</span>
              <span className="ml-auto text-sm" style={{ color: 'var(--ink-faint)' }}>Next due: {fmt(p.next_due_date)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
