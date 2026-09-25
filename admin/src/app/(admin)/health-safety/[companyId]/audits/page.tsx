import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardCheck, Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HsAudit } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'H&S audits' };
export const dynamic = 'force-dynamic';

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function scoreColour(score: number | null): string {
  if (score == null) return 'var(--ink-faint)';
  if (score >= 90) return 'var(--success)';
  if (score >= 70) return 'var(--amber)';
  return 'var(--danger)';
}

// Every audit run against this client, newest first. INSERT-only (110):
// a correction is a new audit, so this is a full history, not a
// current-state table.
export default async function HealthSafetyAuditsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: audits, error }, { data: findingCounts }] = await Promise.all([
    supabase.from('hs_audits')
      .select('id, company_id, site_id, template_id, title, conducted_on, score, notes, recorded_by_kind, created_at')
      .eq('company_id', params.companyId)
      .order('conducted_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('hs_audit_responses')
      .select('audit_id')
      .eq('company_id', params.companyId)
      .eq('rating', 'fail'),
  ]);

  const findings = new Map<string, number>();
  for (const r of (findingCounts ?? []) as { audit_id: string }[]) {
    findings.set(r.audit_id, (findings.get(r.audit_id) ?? 0) + 1);
  }

  const rows = (audits ?? []) as HsAudit[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>On-site audits and their findings.</p>
        <Link href={`/health-safety/${params.companyId}/audits/new`} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Run new audit
        </Link>
      </div>

      {error && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>Audits could not be loaded: {error.message}</p>}

      {rows.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <ClipboardCheck size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No audits recorded yet</p>
            <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>Run the first on-site audit to start this client&apos;s audit history.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Audit</th>
                <th>Date</th>
                <th>Score</th>
                <th>Findings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td><Link href={`/health-safety/${params.companyId}/audits/${a.id}`} style={{ color: 'var(--purple)' }}>{a.title}</Link></td>
                  <td>{fmt(a.conducted_on)}</td>
                  <td style={{ color: scoreColour(a.score), fontWeight: 600 }}>{a.score == null ? '—' : `${Math.round(a.score)}%`}</td>
                  <td>{findings.get(a.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
