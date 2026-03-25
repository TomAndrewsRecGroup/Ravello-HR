'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

interface Props {
  reqs: any[];
  companies: { id: string; name: string }[];
}

const FRICTION_ORDER: Record<string, number> = {
  Critical: 0,
  High:     1,
  Medium:   2,
  Low:      3,
  Unknown:  4,
};

function frictionBadgeStyle(level: string): React.CSSProperties {
  switch (level) {
    case 'Low':      return { background: 'rgba(52,211,153,0.14)', color: '#047857' };
    case 'Medium':   return { background: 'rgba(245,158,11,0.15)', color: '#8A5500' };
    case 'High':     return { background: 'rgba(217,68,68,0.10)',  color: '#B02020' };
    case 'Critical': return { background: 'rgba(127,17,17,0.14)',  color: '#7F1111' };
    default:         return { background: 'rgba(7,11,29,0.07)',    color: '#38436A' };
  }
}

function rowBorderStyle(req: any, daysOpen: number): React.CSSProperties {
  const level = req.friction_level ?? 'Unknown';
  if (level === 'Critical') return { borderLeft: '3px solid #B02020' };
  if (level === 'High')     return { borderLeft: '3px solid #F59E0B' };
  if (daysOpen >= 30)       return { borderLeft: '3px solid #F59E0B' };
  return {};
}

function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

const stageBadge: Record<string, string> = {
  submitted:       'badge-submitted',
  in_progress:     'badge-inprogress',
  shortlist_ready: 'badge-shortlist',
  interview:       'badge-interview',
  offer:           'badge-offer',
  filled:          'badge-filled',
  cancelled:       'badge-cancelled',
};

const FRICTION_OPTIONS = ['All', 'Low', 'Medium', 'High', 'Critical'];

export default function HiringClient({ reqs, companies }: Props) {
  const [frictionFilter, setFrictionFilter] = useState('All');
  const [companyFilter,  setCompanyFilter]  = useState('all');
  const [sortField,      setSortField]      = useState<'friction' | 'days'>('friction');
  const [sortDir,        setSortDir]        = useState<'asc' | 'desc'>('asc');

  function toggleSort(field: 'friction' | 'days') {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const processed = useMemo(() => {
    let list = reqs.map(r => ({
      ...r,
      _daysOpen: daysOpen(r.created_at),
      _friction: r.friction_level ?? 'Unknown',
    }));

    if (frictionFilter !== 'All') {
      list = list.filter(r => r._friction === frictionFilter);
    }
    if (companyFilter !== 'all') {
      list = list.filter(r => r.companies?.id === companyFilter);
    }

    list.sort((a, b) => {
      if (sortField === 'friction') {
        const diff = (FRICTION_ORDER[a._friction] ?? 4) - (FRICTION_ORDER[b._friction] ?? 4);
        return sortDir === 'asc' ? diff : -diff;
      } else {
        const diff = b._daysOpen - a._daysOpen;
        return sortDir === 'asc' ? -diff : diff;
      }
    });

    return list;
  }, [reqs, frictionFilter, companyFilter, sortField, sortDir]);

  function SortIcon({ field }: { field: 'friction' | 'days' }) {
    if (sortField !== field) return <ChevronsUpDown size={12} className="inline ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="inline ml-1" style={{ color: 'var(--purple)' }} />
      : <ChevronDown size={12} className="inline ml-1" style={{ color: 'var(--purple)' }} />;
  }

  return (
    <>
      {/* Filter bar */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>Friction:</span>
          {FRICTION_OPTIONS.map(f => (
            <button
              key={f}
              onClick={() => setFrictionFilter(f)}
              className={`btn btn-sm ${frictionFilter === f ? 'btn-cta' : 'btn-secondary'}`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <select
            className="input"
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
          >
            <option value="all">All clients</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {processed.length === 0 ? (
        <div className="card empty-state">No active roles across any client.</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Role Title</th>
                <th>Location</th>
                <th>Working Model</th>
                <th>
                  <button onClick={() => toggleSort('days')} className="flex items-center gap-1">
                    Days Open <SortIcon field="days" />
                  </button>
                </th>
                <th>
                  <button onClick={() => toggleSort('friction')} className="flex items-center gap-1">
                    Friction <SortIcon field="friction" />
                  </button>
                </th>
                <th>Stage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processed.map((r: any) => {
                const days      = r._daysOpen;
                const friction  = r._friction;
                const companyId = r.companies?.id;

                return (
                  <tr key={r.id} style={rowBorderStyle(r, days)}>
                    <td>
                      {companyId ? (
                        <Link
                          href={`/clients/${companyId}`}
                          className="font-medium hover:underline"
                          style={{ color: 'var(--purple)' }}
                        >
                          {r.companies?.name ?? '—'}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--ink-soft)' }}>{r.companies?.name ?? '—'}</span>
                      )}
                    </td>
                    <td className="font-medium">{r.title}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{r.location ?? '—'}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{r.working_model ?? '—'}</td>
                    <td>
                      <span
                        className="font-medium"
                        style={{ color: days >= 30 ? '#B02020' : days >= 14 ? '#8A5500' : 'var(--ink-soft)' }}
                      >
                        {days}d
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={frictionBadgeStyle(friction)}
                      >
                        {friction}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${stageBadge[r.stage] ?? 'badge-normal'}`}>
                        {r.stage?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {companyId && (
                        <Link href={`/clients/${companyId}`} className="btn-ghost btn-sm">
                          View Client →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
