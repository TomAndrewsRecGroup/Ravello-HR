'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import {
  Building2, MapPin, Calendar, Briefcase, Loader2,
  AlertCircle, Key, RefreshCw,
} from 'lucide-react';

interface BDRole {
  title: string;
  posted_at?: string;
}

interface BDLead {
  company_name: string;
  company_location: string;
  roles: BDRole[];
  sent_at: string;
}

export default function BDLeadsPage() {
  const [leads, setLeads]         = useState<BDLead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');
  const [noKey, setNoKey]         = useState(false);

  async function fetchLeads(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(''); setNoKey(false);
    try {
      const res = await fetch('/api/bd/leads');
      if (res.status === 404) { setNoKey(true); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load BD leads');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }

  useEffect(() => { fetchLeads(); }, []);

  return (
    <>
      <Topbar
        title="BD Leads"
        subtitle="Prospective companies from your IvyLens pipeline"
      />
      <main className="portal-page flex-1 max-w-[960px] space-y-5">

        {loading && (
          <div className="flex items-center gap-2 py-8" style={{ color: 'var(--ink-faint)' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--purple)' }} />
            <span className="text-sm">Loading leads…</span>
          </div>
        )}

        {!loading && noKey && (
          <div className="card p-8 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(124,58,237,0.08)' }}
            >
              <Key size={26} style={{ color: 'var(--purple)' }} />
            </div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>No API key configured</h2>
            <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--ink-soft)' }}>
              Add an IvyLens partner key with <strong>bd_pipeline</strong> permission
              on the Partners page to start receiving leads.
            </p>
            <Link href="/partners" className="btn-cta inline-flex items-center gap-2">
              <Key size={13} /> Go to Partners
            </Link>
          </div>
        )}

        {!loading && error && (
          <div
            className="flex items-center gap-2 p-4 rounded-[12px]"
            style={{ background: 'rgba(217,68,68,0.06)', color: '#B02020' }}
          >
            <AlertCircle size={14} />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !noKey && !error && leads.length === 0 && (
          <div className="card p-8 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(59,111,255,0.08)' }}
            >
              <Building2 size={26} style={{ color: 'var(--blue)' }} />
            </div>
            <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--ink)' }}>No leads yet</h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Your IvyLens pipeline hasn’t sent any BD leads yet. Check back soon.
            </p>
          </div>
        )}

        {!loading && leads.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {leads.length} lead{leads.length !== 1 ? 's' : ''} from IvyLens pipeline
              </p>
              <button
                onClick={() => fetchLeads(true)}
                disabled={refreshing}
                className="btn-secondary btn-sm flex items-center gap-1.5"
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="space-y-4">
              {leads.map((lead, i) => (
                <div key={i} className="card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(59,111,255,0.08)' }}
                      >
                        <Building2 size={16} style={{ color: 'var(--blue)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                          {lead.company_name}
                        </p>
                        {lead.company_location && (
                          <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                            <MapPin size={10} /> {lead.company_location}
                          </p>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1.5 flex-shrink-0"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      <Calendar size={11} />
                      <span className="text-[11px]">
                        {new Date(lead.sent_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  {lead.roles.length > 0 && (
                    <div>
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        <Briefcase size={10} className="inline mr-1" />
                        {lead.roles.length} Role{lead.roles.length !== 1 ? 's' : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {lead.roles.map((r, j) => (
                          <span
                            key={j}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                            style={{
                              background: 'var(--surface-alt)',
                              color: 'var(--ink-soft)',
                              border: '1px solid var(--line)',
                            }}
                          >
                            {r.title}
                            {r.posted_at && (
                              <span style={{ color: 'var(--ink-faint)' }}>
                                · {new Date(r.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

      </main>
    </>
  );
}
