'use client';
import { useState } from 'react';
import Link from 'next/link';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
  companies: { name: string } | null;
}

interface Props { tickets: Ticket[] }

const prioBadge:   Record<string, string> = { urgent: 'badge-urgent', high: 'badge-high', normal: 'badge-normal', low: 'badge-normal' };
const statusBadge: Record<string, string> = { open: 'badge-open', in_progress: 'badge-inprogress', resolved: 'badge-resolved', closed: 'badge-normal' };

type Filter = 'all' | 'open' | 'in_progress' | 'resolved';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'open',        label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved',    label: 'Resolved / Closed' },
];

export default function SupportClient({ tickets }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = tickets.filter(t => {
    if (filter === 'all')         return true;
    if (filter === 'open')        return t.status === 'open';
    if (filter === 'in_progress') return t.status === 'in_progress';
    if (filter === 'resolved')    return t.status === 'resolved' || t.status === 'closed';
    return true;
  });

  const counts: Record<Filter, number> = {
    all:         tickets.length,
    open:        tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved:    tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
  };

  return (
    <div className="space-y-5">
      {/* Filter tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--line)' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-4 py-2.5 text-sm font-semibold transition-all relative flex items-center gap-2"
            style={{
              color: filter === f.key ? 'var(--purple)' : 'var(--ink-soft)',
              borderBottom: filter === f.key ? '2px solid var(--purple)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {f.label}
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: filter === f.key ? 'rgba(124,58,237,0.12)' : 'rgba(7,11,29,0.07)',
                color: filter === f.key ? 'var(--purple)' : 'var(--ink-faint)',
              }}
            >
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card p-12 empty-state">No tickets match this filter.</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Client</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Raised</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td className="font-medium" style={{ color: 'var(--ink)' }}>{t.subject}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{t.companies?.name ?? '—'}</td>
                  <td><span className={`badge ${prioBadge[t.priority] ?? 'badge-normal'}`}>{t.priority}</span></td>
                  <td><span className={`badge ${statusBadge[t.status] ?? 'badge-normal'}`}>{t.status.replace('_', ' ')}</span></td>
                  <td style={{ color: 'var(--ink-faint)' }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                  <td>
                    {t.status === 'resolved' || t.status === 'closed'
                      ? <Link href={`/support/${t.id}`} className="btn-ghost btn-sm">View</Link>
                      : <Link href={`/support/${t.id}`} className="btn-cta btn-sm">Respond →</Link>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
