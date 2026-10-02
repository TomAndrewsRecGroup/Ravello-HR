'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Send, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { groupBroadcastActions, type BroadcastActionRow } from '@/lib/broadcast/rollup';

// Groups individual action rows back into the broadcasts that created
// them — see lib/broadcast/rollup.ts for the grouping/completion logic
// itself (source_id when present, the title|description|timestamp
// heuristic otherwise).

const PRIORITY_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  urgent: { bg: 'rgba(217,68,68,0.10)',  fg: 'var(--red)',    label: 'Urgent' },
  high:   { bg: 'rgba(245,158,11,0.12)', fg: 'var(--amber)',  label: 'High' },
  normal: { bg: 'rgba(59,111,255,0.08)', fg: 'var(--blue)',   label: 'Normal' },
  low:    { bg: 'rgba(7,11,29,0.06)',    fg: 'var(--ink-soft)', label: 'Low' },
};

const PAGE_SIZE = 10;

export default function RecentBroadcasts({ actions, acknowledgedActionIds }: { actions: BroadcastActionRow[]; acknowledgedActionIds?: ReadonlySet<string> }) {
  const [page, setPage] = useState(1);

  const buckets = useMemo(() => groupBroadcastActions(actions, acknowledgedActionIds), [actions, acknowledgedActionIds]);

  const totalPages = Math.max(1, Math.ceil(buckets.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const visible = buckets.slice(start, start + PAGE_SIZE);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display text-sm font-semibold" style={{ color: 'var(--ink)' }}>Recent broadcasts</h3>
          <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>Last 90 days · {buckets.length} send{buckets.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="empty-state py-8">
          <Send size={20} style={{ color: 'var(--ink-faint)' }} />
          <p className="text-sm mt-2" style={{ color: 'var(--ink-faint)' }}>
            No broadcasts sent yet.
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Sent</th>
                  <th>Recipients</th>
                  <th>Completion</th>
                  <th>Acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(b => {
                  const tone = PRIORITY_TONE[b.priority] ?? PRIORITY_TONE.normal;
                  return (
                    <tr key={b.key}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{b.title}</p>
                          {b.regulatory && (
                            <span
                              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md whitespace-nowrap"
                              style={{ background: 'rgba(11,120,150,0.08)', color: 'var(--purple)' }}
                              title="Raised from a legal requirement or regulatory update — Core-OS 360 Completion Programme, Phase 25, Group 6 (C17.7)"
                            >
                              <ScrollText size={10} /> Regulatory
                            </span>
                          )}
                        </div>
                        {b.description && (
                          <p className="text-[11px] mt-0.5 truncate max-w-[28ch]" style={{ color: 'var(--ink-faint)' }}>
                            {b.description}
                          </p>
                        )}
                      </td>
                      <td>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        {b.due_date ? new Date(b.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[320px]">
                          {b.companies.slice(0, 5).map(c => (
                            <Link
                              key={c.id}
                              prefetch={false}
                              href={`/clients/${c.slug ?? c.id}`}
                              className="text-[10px] px-1.5 py-0.5 rounded-md hover:underline"
                              style={{ background: 'rgba(11,120,150,0.06)', color: 'var(--purple)' }}
                            >
                              {c.name}
                            </Link>
                          ))}
                          {b.companies.length > 5 && (
                            <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                              +{b.companies.length - 5} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-xs" style={{ color: b.complete === b.total ? 'var(--teal)' : 'var(--ink-faint)' }}>
                        {b.complete} of {b.total} complete
                      </td>
                      <td className="text-xs" style={{ color: b.acknowledged === b.total ? 'var(--teal)' : 'var(--ink-faint)' }}>
                        {b.acknowledged} of {b.total} acknowledged
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-icon btn-sm disabled:opacity-30"
                  aria-label="Previous"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-icon btn-sm disabled:opacity-30"
                  aria-label="Next"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
