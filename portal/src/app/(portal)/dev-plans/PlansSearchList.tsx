'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ClipboardList, ArrowUpRight } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active', completed: 'Completed',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  active:    { bg: 'rgba(124,58,237,0.10)', fg: 'var(--purple)' },
  completed: { bg: 'rgba(20,184,166,0.12)', fg: 'var(--teal)' },
};

export interface PlanItem {
  id: string;
  title: string;
  summary: string | null;  // not rendered — kept on the type for future use
  status: string;
  athlete_name: string | null;
}

export default function PlansSearchList({ rows }: { rows: PlanItem[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      (r.athlete_name ?? '').toLowerCase().includes(needle)
      || r.title.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <ClipboardList size={32} className="mx-auto mb-3" style={{ color: 'var(--ink-faint)' }} />
        <p className="font-semibold">No development plans yet</p>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
          Your account manager will share plans here once they&apos;re ready.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative max-w-sm mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-faint)' }} />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by athlete or plan title"
          className="input pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No plans match your search.</div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(r => {
            const style = STATUS_STYLE[r.status] ?? STATUS_STYLE.active;
            return (
              <li key={r.id}>
                <Link
                  href={`/dev-plans/${r.id}`}
                  className="group block rounded-xl p-4 transition-all hover:-translate-y-0.5"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderLeft: `4px solid ${style.fg}`,
                    boxShadow: '0 1px 2px rgba(7,11,29,0.04)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 w-9 h-9 rounded-lg flex-shrink-0"
                         style={{ background: style.bg, color: style.fg, justifyContent: 'center' }}>
                      <ClipboardList size={16} />
                    </div>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: style.bg, color: style.fg }}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-base mt-3 leading-snug" style={{ color: 'var(--ink)' }}>
                    {r.title}
                  </h3>
                  {r.athlete_name && (
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
                      {r.athlete_name}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-end text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                       style={{ color: style.fg }}>
                    Open plan <ArrowUpRight size={11} className="ml-0.5" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
