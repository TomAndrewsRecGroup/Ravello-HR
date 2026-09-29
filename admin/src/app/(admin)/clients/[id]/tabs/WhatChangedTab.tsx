'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Activity } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { readAllPages } from '@/lib/supabase/paged';
import { computeWhatChanged, type PlatformEventRow, type WhatChangedSummary } from '@/lib/whatChanged/compute';

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return toISODate(d);
}
function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISODate(d);
}
function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Core-OS 360 Phase 9, Group 2. platform_events (096) has recorded
// every create/update/delete on this client since 2026-09-25 — this
// is the first thing anywhere to render it back as a readable daily
// summary. A plain client-side read under the staff session
// (platform_events_staff_read RLS, no service role needed) rather than
// the generic client-tab-data lazy-load mechanism, because that
// mechanism fetches once per tab open with no date parameter — this
// tab re-fetches on every date change, the same self-contained-fetch
// shape RaLinks.tsx/EvidenceLinksPanel.tsx already use for their own
// per-record data.
//
// Defaults to yesterday, not today: today is still in progress, and
// "what changed" reads more naturally as a completed day's retrospective
// — the same reasoning the H&S weekly digest reports a week that has
// just ended, never one still running.
export default function WhatChangedTab({ companyId }: { companyId: string }) {
  const [day, setDay] = useState(yesterday());
  const [summary, setSummary] = useState<WhatChangedSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError('');
      const supabase = createClient();
      const dayStart = `${day}T00:00:00.000Z`;
      const dayEnd = `${shiftDay(day, 1)}T00:00:00.000Z`;
      const result = await readAllPages<PlatformEventRow>((from, to) =>
        supabase.from('platform_events').select('entity_type, event_type, actor_kind')
          .eq('company_id', companyId).gte('occurred_at', dayStart).lt('occurred_at', dayEnd)
          .order('id').range(from, to));
      if (cancelled) return;
      setLoading(false);
      if (result.error) { setError(result.error); return; }
      setTruncated(result.truncated);
      setSummary(computeWhatChanged(result.rows, day));
    }
    load();
    return () => { cancelled = true; };
  }, [companyId, day]);

  const isToday = day === toISODate(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-icon btn-sm" aria-label="Previous day" onClick={() => setDay(d => shiftDay(d, -1))}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold min-w-[220px] text-center" style={{ color: 'var(--ink)' }}>{fmtDay(day)}</span>
        <button type="button" className="btn-icon btn-sm" aria-label="Next day" disabled={isToday} onClick={() => setDay(d => shiftDay(d, 1))}>
          <ChevronRight size={14} />
        </button>
        <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setDay(yesterday())}>Yesterday</button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--purple)' }} />
        </div>
      )}
      {error && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load this day&apos;s activity: {error}</p>}

      {!loading && !error && summary && (
        summary.totalEvents === 0 ? (
          <div className="card empty-state p-10">
            <Activity size={24} style={{ color: 'var(--ink-faint)' }} />
            <p style={{ color: 'var(--ink-faint)' }}>Nothing changed for this client on this day.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="card p-4 flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
              <span><strong style={{ color: 'var(--ink)' }}>{summary.totalEvents}</strong> change{summary.totalEvents === 1 ? '' : 's'}</span>
              <span>{summary.humanActorCount} by people, {summary.systemActorCount} automated</span>
              {truncated && <span style={{ color: 'var(--gold)' }}>Showing the first 200,000 — an unusually high-volume day.</span>}
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Record type</th><th>Created</th><th>Updated</th><th>Deleted</th><th>Reminders</th><th>Total</th></tr></thead>
                <tbody>
                  {summary.categories.map(c => (
                    <tr key={c.entityType}>
                      <td className="font-medium">{c.label}</td>
                      <td style={{ color: c.created > 0 ? 'var(--teal)' : 'var(--ink-faint)' }}>{c.created || '—'}</td>
                      <td style={{ color: c.updated > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>{c.updated || '—'}</td>
                      <td style={{ color: c.deleted > 0 ? 'var(--red)' : 'var(--ink-faint)' }}>{c.deleted || '—'}</td>
                      <td style={{ color: c.reminders > 0 ? 'var(--blue)' : 'var(--ink-faint)' }}>{c.reminders || '—'}</td>
                      <td className="font-semibold">{c.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
