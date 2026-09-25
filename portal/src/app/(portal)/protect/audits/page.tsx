import type { Metadata } from 'next';
import { ClipboardCheck } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import type { HsAudit } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Audits' };
export const dynamic = 'force-dynamic';

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function scoreColour(score: number | null): string {
  if (score == null) return 'var(--ink-faint)';
  if (score >= 90) return 'var(--success)';
  if (score >= 70) return 'var(--amber)';
  return 'var(--danger)';
}

// On-site audits Core OS 360 has run against this client's site(s),
// read-only — nothing here is self-certified, same posture as the
// Register and the rest of the Safety Timeline's sources. A failed
// answer already raised an action (see /protect/actions); this is the
// audit history and score, not the individual findings.
export default async function ProtectAuditsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: audits, error } = await supabase
    .from('hs_audits')
    .select('id, title, conducted_on, score, notes')
    .eq('company_id', companyId)
    .order('conducted_on', { ascending: false })
    .limit(100);

  const rows = (audits ?? []) as HsAudit[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>Audits could not be loaded. Refresh to try again.</p>}
      {rows.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <ClipboardCheck size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No audits recorded yet</p>
            <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>
              On-site audits Core OS 360 runs for you will appear here with their score.
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Audit</th><th>Date</th><th>Score</th></tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{fmt(a.conducted_on)}</td>
                  <td style={{ color: scoreColour(a.score), fontWeight: 600 }}>{a.score == null ? '—' : `${Math.round(a.score)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
