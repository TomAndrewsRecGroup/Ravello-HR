'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, XCircle, Zap, Clock, Gauge, Database, Loader2, PlugZap } from 'lucide-react';
import type { ClientHealth, IvylensHealth } from './page';
import { clientHref } from '@/lib/clientHref';

interface ProbeResult {
  ok: boolean;
  stage: 'env' | 'live' | 'rate_limited' | 'upstream';
  env?: { IVYLENS_API_URL: boolean; IVYLENS_API_KEY: boolean; apiHost: string | null };
  latency_ms?: number;
  status?: number;
  message: string;
  error?: string;
  /** Recomputed telemetry aggregate after the probe call landed.
   *  When present we swap the panel's cards over to it so the user
   *  doesn't see stale zeros from page-level ISR. */
  health?: IvylensHealth;
}

interface Props {
  ivylens: IvylensHealth;
  clients: ClientHealth[];
  rag:     { green: number; amber: number; red: number };
}

function relative(ts: string | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(iv: IvylensHealth): { label: string; color: string; bg: string; icon: any } {
  if (!iv.configured) return { label: 'Not configured', color: 'var(--ink-faint)', bg: 'rgba(148,163,184,0.10)', icon: AlertTriangle };
  if (iv.rate_limited_hits > 0 && iv.rate_limit_headroom < 10) return { label: 'Rate limited', color: 'var(--red)', bg: 'rgba(217,68,68,0.10)', icon: XCircle };
  if (iv.errors_last_24h > 5) return { label: 'Degraded', color: 'var(--gold)', bg: 'rgba(191,143,40,0.10)', icon: AlertTriangle };
  if (iv.calls_last_24h === 0) return { label: 'Idle', color: 'var(--ink-faint)', bg: 'rgba(148,163,184,0.10)', icon: Clock };
  return { label: 'Healthy', color: 'var(--teal)', bg: 'rgba(20,184,166,0.10)', icon: CheckCircle2 };
}

export default function HealthClient({ ivylens: initialIvylens, clients, rag }: Props) {
  const [filter, setFilter] = useState<'all' | 'red' | 'amber' | 'green'>('all');
  const filtered = filter === 'all' ? clients : clients.filter(c => c.band === filter);

  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  // Live mirror of the IvyLens telemetry the page rendered with. Probe
  // responses include a freshly-recomputed aggregate (`health`) and we
  // swap to it here, so the cards reflect the call we just made
  // without waiting for the 30-second ISR window to elapse.
  const [ivylens, setIvylens] = useState<IvylensHealth>(initialIvylens);

  const iv = statusBadge(ivylens);
  const IvIcon = iv.icon;

  async function runProbe() {
    setProbing(true);
    setProbe(null);
    try {
      const res = await fetch('/api/ivylens/probe', { cache: 'no-store' });
      const json = await res.json() as ProbeResult;
      setProbe(json);
      if (json.health) setIvylens(json.health);
    } catch (err) {
      setProbe({ ok: false, stage: 'upstream', message: `Probe failed: ${(err as Error).message}` });
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── IvyLens integration panel ── */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>
            IvyLens Integration
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runProbe}
              disabled={probing}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              {probing ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              {probing ? 'Testing…' : 'Test connection'}
            </button>
            <span className="badge text-xs font-semibold flex items-center gap-1.5" style={{ background: iv.bg, color: iv.color }}>
              <IvIcon size={12} /> {iv.label}
            </span>
          </div>
        </div>

        {/* Probe result strip */}
        {probe && (
          <div
            className="card p-3 mb-3 flex items-start gap-2.5"
            style={{
              background: probe.ok ? 'rgba(20,184,166,0.06)' : 'rgba(217,68,68,0.06)',
              borderColor: probe.ok ? 'rgba(20,184,166,0.30)' : 'rgba(217,68,68,0.30)',
            }}
          >
            {probe.ok
              ? <CheckCircle2 size={15} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
              : <XCircle      size={15} style={{ color: 'var(--red)',  flexShrink: 0, marginTop: 2 }} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: probe.ok ? 'var(--teal)' : 'var(--red)' }}>
                {probe.ok ? 'Connection healthy' : 'Connection failed'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                {probe.message}
              </p>
              {(probe.latency_ms !== undefined || probe.status !== undefined || probe.env?.apiHost) && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                  {probe.env?.apiHost && <>host: <strong>{probe.env.apiHost}</strong> · </>}
                  {probe.status !== undefined && <>status: <strong>{probe.status}</strong> · </>}
                  {probe.latency_ms !== undefined && <>latency: <strong>{probe.latency_ms}ms</strong></>}
                </p>
              )}
              {probe.env && (probe.env.IVYLENS_API_URL === false || probe.env.IVYLENS_API_KEY === false) && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                  Env: IVYLENS_API_URL = <strong style={{ color: probe.env.IVYLENS_API_URL ? 'var(--teal)' : 'var(--red)' }}>{probe.env.IVYLENS_API_URL ? 'set' : 'missing'}</strong> · IVYLENS_API_KEY = <strong style={{ color: probe.env.IVYLENS_API_KEY ? 'var(--teal)' : 'var(--ink-faint)' }}>{probe.env.IVYLENS_API_KEY ? 'set' : 'not set (public endpoint)'}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={12} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Calls (24h)</p>
            </div>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>
              {ivylens.calls_last_24h}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
              of 1000 daily limit
            </p>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gauge size={12} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Rate-limit headroom</p>
            </div>
            <p className="font-display font-bold text-2xl" style={{ color: ivylens.rate_limit_headroom > 50 ? 'var(--teal)' : ivylens.rate_limit_headroom > 20 ? 'var(--gold)' : 'var(--red)' }}>
              {ivylens.rate_limit_headroom}%
            </p>
            <div className="h-1 w-full rounded-full mt-2" style={{ background: 'var(--surface-alt)' }}>
              <div className="h-full rounded-full" style={{ width: `${ivylens.rate_limit_headroom}%`, background: ivylens.rate_limit_headroom > 50 ? 'var(--teal)' : ivylens.rate_limit_headroom > 20 ? 'var(--gold)' : 'var(--red)' }} />
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={12} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Errors (24h)</p>
            </div>
            <p className="font-display font-bold text-2xl" style={{ color: ivylens.errors_last_24h > 0 ? 'var(--gold)' : 'var(--ink)' }}>
              {ivylens.errors_last_24h}
            </p>
            {ivylens.rate_limited_hits > 0 && (
              <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>
                {ivylens.rate_limited_hits} rate-limited
              </p>
            )}
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={12} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>p50 latency</p>
            </div>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>
              {ivylens.p50_latency_ms !== null ? `${ivylens.p50_latency_ms}ms` : '-'}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
              last call: {relative(ivylens.last_call_at)}
            </p>
          </div>
        </div>

        <div className="card p-4 mt-4 flex items-center gap-6 text-xs" style={{ color: 'var(--ink-soft)' }}>
          <div className="flex items-center gap-1.5">
            <Database size={12} style={{ color: 'var(--ink-faint)' }} />
            <span><strong>{ivylens.cache_entries}</strong> cached keys</span>
          </div>
          {ivylens.oldest_cache_at && (
            <div>oldest cache entry: <strong>{relative(ivylens.oldest_cache_at)}</strong></div>
          )}
          {ivylens.last_status !== null && (
            <div>last status: <strong>{ivylens.last_status}</strong></div>
          )}
          {!ivylens.configured && (
            <div style={{ color: 'var(--red)' }}>
              ⚠ IVYLENS_API_URL / IVYLENS_API_KEY not set in Vercel
            </div>
          )}
        </div>
      </section>

      {/* ── Client health panel ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>
            Client Health
          </h2>
          <div className="flex items-center gap-1.5 text-xs">
            <button onClick={() => setFilter('all')}
              className={`btn btn-sm ${filter === 'all' ? 'btn-cta' : 'btn-secondary'}`}>
              All ({clients.length})
            </button>
            <button onClick={() => setFilter('green')}
              className={`btn btn-sm ${filter === 'green' ? 'btn-cta' : 'btn-secondary'}`}>
              On track ({rag.green})
            </button>
            <button onClick={() => setFilter('amber')}
              className={`btn btn-sm ${filter === 'amber' ? 'btn-cta' : 'btn-secondary'}`}>
              Watch ({rag.amber})
            </button>
            <button onClick={() => setFilter('red')}
              className={`btn btn-sm ${filter === 'red' ? 'btn-cta' : 'btn-secondary'}`}>
              At risk ({rag.red})
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Overdue Compliance</th>
                <th>Open Tickets</th>
                <th>Stalled Roles</th>
                <th>Band</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const bandStyle = c.band === 'red'
                  ? { bg: 'rgba(217,68,68,0.10)', color: 'var(--red)' }
                  : c.band === 'amber'
                    ? { bg: 'rgba(191,143,40,0.10)', color: 'var(--gold)' }
                    : { bg: 'rgba(20,184,166,0.10)', color: 'var(--teal)' };
                return (
                  <tr key={c.id}>
                    <td className="font-medium" style={{ color: 'var(--ink)' }}>{c.name}</td>
                    <td>
                      <span className={`badge ${c.active ? 'badge-active' : 'badge-inactive'} text-[10px]`}>
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: c.overdue_comp > 0 ? 'var(--red)' : 'var(--ink-faint)' }}>
                      {c.overdue_comp || '-'}
                    </td>
                    <td style={{ color: c.open_tickets > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>
                      {c.open_tickets || '-'}
                    </td>
                    <td style={{ color: c.stalled_reqs > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>
                      {c.stalled_reqs || '-'}
                    </td>
                    <td>
                      <span className="badge text-[10px] font-semibold" style={{ background: bandStyle.bg, color: bandStyle.color }}>
                        {c.band.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <Link href={clientHref(c)} prefetch={false} className="btn-ghost btn-sm">
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
