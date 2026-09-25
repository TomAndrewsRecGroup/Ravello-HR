'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw } from 'lucide-react';

interface Run { id: number; job: string; started_at: string; finished_at: string | null; outcome: string; tally: Record<string, unknown>; error: string | null }
interface FailedEvent { id: number; occurred_at: string; company_id: string | null; entity_type: string; entity_id: string | null; event_type: string; attempts: number; last_error: string | null; actor_kind: string }
interface RecentEvent { id: number; occurred_at: string; entity_type: string; event_type: string; actor_kind: string; processed_at: string | null; company_id: string | null }

interface Props {
  runs: Run[];
  pendingCount: number;
  failed: FailedEvent[];
  recent: RecentEvent[];
  loadError: string | null;
}

const OUTCOME: Record<string, { colour: string; Icon: React.ElementType }> = {
  ok:           { colour: 'var(--success)', Icon: CheckCircle2 },
  degraded:     { colour: 'var(--amber)',   Icon: AlertTriangle },
  error:        { colour: 'var(--danger)',  Icon: AlertTriangle },
  disabled:     { colour: 'var(--ink-faint)', Icon: Clock },
  unauthorized: { colour: 'var(--danger)',  Icon: AlertTriangle },
};

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

function summarise(job: string, tally: Record<string, unknown>): string {
  const t = tally as Record<string, number | Record<string, number>>;
  if (job === 'process-events') return `${t.claimed ?? 0} claimed · ${t.processed ?? 0} processed · ${t.notified ?? 0} notified · ${t.emailed ?? 0} emailed${(t.email_failures as number) ? ` · ${t.email_failures} email failures` : ''}${(t.failed as number) ? ` · ${t.failed} failed` : ''}`;
  if (job === 'reminders') {
    const r = (t.reminders ?? {}) as Record<string, unknown>;
    const p = (t.processed ?? {}) as Record<string, unknown>;
    const sw = Object.entries((r.status_writes ?? {}) as Record<string, number>).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ');
    return `${r.rows_read ?? 0} rows · ${r.events_new ?? 0} new reminders · ${p.notified ?? 0} notified${sw ? ` · ${sw}` : ''}`;
  }
  if (job === 'digest') return `${t.users ?? 0} users · ${t.emailed ?? 0} emailed · ${t.items ?? 0} items${(t.email_failures as number) ? ` · ${t.email_failures} failures` : ''}`;
  return JSON.stringify(tally).slice(0, 160);
}

export default function AutomationClient({ runs, pendingCount, failed, recent, loadError }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry(id: number) {
    setBusy(id); setError(null);
    try {
      const res = await fetch('/api/admin/automation/retry', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_id: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Retry failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const lastByJob = new Map<string, Run>();
  for (const r of runs) if (!lastByJob.has(r.job)) lastByJob.set(r.job, r);

  return (
    <div className="space-y-8">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>Part of this page could not be loaded: {loadError}</p>}
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="grid sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-faint)' }}>Waiting to process</p>
          <p className="font-display font-bold text-2xl" style={{ color: pendingCount > 0 ? 'var(--ink)' : 'var(--ink-faint)' }}>{pendingCount}</p>
        </div>
        {['process-events', 'reminders', 'digest'].map(job => {
          const r = lastByJob.get(job);
          const O = OUTCOME[r?.outcome ?? 'disabled'] ?? OUTCOME.disabled;
          return (
            <div key={job} className="card p-4">
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-faint)' }}>{job}</p>
              <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: O.colour }}>
                <O.Icon size={13} aria-hidden /> {r ? r.outcome : 'never run'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{r ? fmt(r.started_at) : 'No run recorded yet'}</p>
            </div>
          );
        })}
      </div>

      <section>
        <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>
          Failed events <span className="font-normal" style={{ color: 'var(--ink-faint)' }}>({failed.length})</span>
        </h2>
        {failed.length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>Nothing has failed.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Event</th><th>When</th><th>Attempts</th><th>Last error</th><th></th></tr></thead>
              <tbody>
                {failed.map(e => (
                  <tr key={e.id}>
                    <td><span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{e.entity_type}.{e.event_type}</span><br /><span className="text-xs" style={{ color: 'var(--ink-faint)' }}>#{e.id} · {e.actor_kind}</span></td>
                    <td style={{ color: 'var(--ink-faint)' }}>{fmt(e.occurred_at)}</td>
                    <td>{e.attempts}</td>
                    <td className="text-xs max-w-[360px]" style={{ color: 'var(--danger)' }}>{e.last_error ?? '—'}</td>
                    <td>
                      <button onClick={() => retry(e.id)} disabled={busy === e.id} className="btn-secondary btn-sm flex items-center gap-1">
                        {busy === e.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Retry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>Recent runs</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Job</th><th>Started</th><th>Outcome</th><th>Summary</th></tr></thead>
            <tbody>
              {runs.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-faint)' }}>No runs recorded. Check the Vercel Cron Jobs tab and CRON_SECRET.</td></tr>}
              {runs.map(r => {
                const O = OUTCOME[r.outcome] ?? OUTCOME.disabled;
                return (
                  <tr key={r.id}>
                    <td className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{r.job}</td>
                    <td style={{ color: 'var(--ink-faint)' }}>{fmt(r.started_at)}</td>
                    <td><span className="text-xs font-semibold flex items-center gap-1" style={{ color: O.colour }}><O.Icon size={12} aria-hidden /> {r.outcome}</span></td>
                    <td className="text-xs" style={{ color: 'var(--ink-soft)' }}>{r.error ? <span style={{ color: 'var(--danger)' }}>{r.error}</span> : summarise(r.job, r.tally ?? {})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>Latest events</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Event</th><th>Actor</th><th>Occurred</th><th>Processed</th></tr></thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-faint)' }}>No events yet.</td></tr>}
              {recent.map(e => (
                <tr key={e.id}>
                  <td className="text-sm" style={{ color: 'var(--ink)' }}>{e.entity_type}.{e.event_type} <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>#{e.id}</span></td>
                  <td className="text-xs" style={{ color: 'var(--ink-faint)' }}>{e.actor_kind}</td>
                  <td style={{ color: 'var(--ink-faint)' }}>{fmt(e.occurred_at)}</td>
                  <td className="text-xs" style={{ color: e.processed_at ? 'var(--success)' : 'var(--amber)' }}>{e.processed_at ? fmt(e.processed_at) : 'waiting'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
