'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, Loader2, TrendingUp, AlertTriangle } from 'lucide-react';

interface Aggregate {
  role_type:     string;
  location:      string | null;
  sample_size:   number;
  salary_p25:    number | null;
  salary_p50:    number | null;
  salary_p75:    number | null;
  salary_p90:    number | null;
  pressure_score: number;
  pressure_band:  'low' | 'moderate' | 'high';
  signal_counts: { high_repost: number; long_vacancy: number; volume_hiring: number };
}

interface Response {
  aggregates:   Aggregate[];
  as_of?:       string;
  cached?:      boolean;
  stale?:       boolean;
  fetched_at?:  string;
  upstream_error?: string;
  error?:       string;
}

function fmtK(n: number | null): string {
  if (!n) return '—';
  return `£${Math.round(n / 1000)}k`;
}

function prettyRole(s: string): string {
  return s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function prettyLocation(s: string | null): string {
  if (!s) return 'Any';
  return s[0].toUpperCase() + s.slice(1);
}

function pressureStyle(band: Aggregate['pressure_band']) {
  if (band === 'high')     return { bg: 'rgba(217,68,68,0.10)', color: 'var(--red)' };
  if (band === 'moderate') return { bg: 'rgba(191,143,40,0.10)', color: 'var(--gold)' };
  return { bg: 'rgba(20,184,166,0.10)', color: 'var(--teal)' };
}

function relative(ts: string | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const hrs  = Math.floor(diff / 3_600_000);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function IvylensMarketSection() {
  const [data,    setData]    = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ivylens/market${force ? '?force=true' : ''}`);
      const json: Response = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); }, []);

  return (
    <div className="card p-5 space-y-4" style={{ borderColor: 'rgba(124,58,237,0.25)' }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={15} style={{ color: 'var(--purple)' }} />
            <p className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              IvyLens Market Data
            </p>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Derived from IvyLens BD feed — salary percentiles and hiring pressure by role type.
            {data?.fetched_at && <> Last synced <strong>{relative(data.fetched_at)}</strong>.</>}
            {data?.stale && <span className="ml-1 font-semibold" style={{ color: 'var(--gold)' }}>Cache stale — IvyLens unavailable</span>}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="btn-secondary btn-sm flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-[8px]"
          style={{ background: 'rgba(217,68,68,0.06)', border: '1px solid rgba(217,68,68,0.20)' }}>
          <AlertTriangle size={13} style={{ color: 'var(--red)' }} className="mt-0.5 shrink-0" />
          <div className="text-xs" style={{ color: 'var(--red)' }}>
            <strong>Could not load market data:</strong> {error}
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-10 gap-2" style={{ color: 'var(--ink-faint)' }}>
          <Loader2 size={14} className="animate-spin" /> Aggregating market signals…
        </div>
      )}

      {data && data.aggregates.length === 0 && (
        <p className="text-xs text-center py-6" style={{ color: 'var(--ink-faint)' }}>
          No market aggregates yet. IvyLens has not surfaced enough roles with salary data to build a sample.
        </p>
      )}

      {data && data.aggregates.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Role Type</th>
                <th>Location</th>
                <th>Sample</th>
                <th>P25</th>
                <th>Median</th>
                <th>P75</th>
                <th>P90</th>
                <th>Hiring Pressure</th>
              </tr>
            </thead>
            <tbody>
              {data.aggregates.map((a, i) => {
                const style = pressureStyle(a.pressure_band);
                return (
                  <tr key={`${a.role_type}-${a.location ?? 'any'}-${i}`}>
                    <td className="font-medium" style={{ color: 'var(--ink)' }}>{prettyRole(a.role_type)}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{prettyLocation(a.location)}</td>
                    <td style={{ color: 'var(--ink-faint)' }}>{a.sample_size}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{fmtK(a.salary_p25)}</td>
                    <td className="font-semibold" style={{ color: 'var(--ink)' }}>{fmtK(a.salary_p50)}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{fmtK(a.salary_p75)}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{fmtK(a.salary_p90)}</td>
                    <td>
                      <span className="badge text-[10px] font-semibold" style={{ background: style.bg, color: style.color }}>
                        {a.pressure_band.toUpperCase()} · {a.pressure_score}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
