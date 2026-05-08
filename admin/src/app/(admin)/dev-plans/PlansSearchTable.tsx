'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Search } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', active: 'Active', completed: 'Completed', archived: 'Archived',
};

export interface PlanRow {
  id: string;
  title: string;
  status: string;
  assigned_at: string | null;
  athlete_name: string | null;
  company_name: string | null;
}

export default function PlansSearchTable({ rows }: { rows: PlanRow[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      (r.athlete_name ?? '').toLowerCase().includes(needle)
      || (r.company_name ?? '').toLowerCase().includes(needle)
      || r.title.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  return (
    <>
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-faint)' }} />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by athlete, client or plan title"
          className="input pl-9"
        />
      </div>

      <div className="card p-0">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Athlete</th>
                <th>Client</th>
                <th>Status</th>
                <th>Assigned</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">{rows.length === 0 ? 'No plans yet — create your first one.' : 'No plans match your search.'}</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td><Link href={`/dev-plans/${r.id}`} className="font-semibold" style={{ color: 'var(--purple)' }}>{r.title}</Link></td>
                  <td>{r.athlete_name ?? <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                  <td>{r.company_name ?? <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                  <td><span className="badge">{STATUS_LABELS[r.status] ?? r.status}</span></td>
                  <td>{r.assigned_at ? new Date(r.assigned_at).toLocaleDateString('en-GB') : <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/dev-plans/${r.id}/preview`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" title="Open preview in a new tab">
                      <Eye size={12} /> Preview
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
