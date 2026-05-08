'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ClipboardList } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active', completed: 'Completed',
};

export interface PlanItem {
  id: string;
  title: string;
  summary: string | null;
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
        <div className="grid gap-3">
          {filtered.map(r => (
            <Link key={r.id} href={`/dev-plans/${r.id}`} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-semibold text-lg">{r.title}</h3>
                  {r.athlete_name && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>For {r.athlete_name}</p>
                  )}
                  {r.summary && (
                    <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>{r.summary}</p>
                  )}
                </div>
                <span className="badge">{STATUS_LABELS[r.status] ?? r.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
