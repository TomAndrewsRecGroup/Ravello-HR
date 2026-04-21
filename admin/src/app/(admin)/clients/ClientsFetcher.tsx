'use client';
import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import ClientsClient from './ClientsClient';

interface Summary {
  companies:       any[];
  activeRolesMap:  Record<string, number>;
  openTicketsMap:  Record<string, number>;
  overdueCompMap:  Record<string, number>;
  usersByCompany:  Record<string, any[]>;
  fetched_at:      string;
}

// Cache the last summary across client-side navigations so revisiting
// /clients within the session feels instant while we re-validate in
// the background (classic stale-while-revalidate pattern).
let memoryCache: Summary | null = null;

export default function ClientsFetcher() {
  const [data,    setData]    = useState<Summary | null>(memoryCache);
  const [loading, setLoading] = useState(!memoryCache);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/clients/summary', {
          // Let the browser honour our Cache-Control: s-maxage + SWR.
          cache: 'default',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Summary;
        if (cancelled) return;
        memoryCache = json;
        setData(json);
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load clients');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 gap-2" style={{ color: 'var(--ink-faint)' }}>
        <Loader2 size={16} className="animate-spin" /> Loading clients…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card p-6 flex items-center gap-3" style={{ borderColor: 'rgba(217,68,68,0.3)' }}>
        <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>Couldn&apos;t load clients</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <ClientsClient
      companies={data.companies as any}
      usersByCompany={data.usersByCompany}
      activeRolesMap={data.activeRolesMap}
      openTicketsMap={data.openTicketsMap}
      overdueCompMap={data.overdueCompMap}
    />
  );
}
