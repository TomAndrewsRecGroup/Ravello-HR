'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ExternalLink, Filter } from 'lucide-react';
import type { FlatRole } from './page';

interface Props { roles: FlatRole[]; }

function fmtSalary(r: FlatRole): string {
  if (r.salary_min && r.salary_max && r.salary_min !== r.salary_max) {
    return `£${Math.round(r.salary_min / 1000)}k – £${Math.round(r.salary_max / 1000)}k`;
  }
  if (r.salary_min || r.salary_max) {
    return `£${Math.round((r.salary_min ?? r.salary_max!) / 1000)}k`;
  }
  return r.salary_text ?? '—';
}

function relative(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  if (wks < 8) return `${wks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function BDRolesClient({ roles }: Props) {
  const [search,   setSearch]   = useState('');
  const [source,   setSource]   = useState<'all' | 'ivylens' | 'local'>('all');
  const [activeOnly, setActiveOnly] = useState(true);

  const boards = useMemo(() => {
    const s = new Set<string>();
    roles.forEach(r => { if (r.source_board) s.add(r.source_board); });
    return Array.from(s).sort();
  }, [roles]);

  const [board, setBoard] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return roles.filter(r => {
      if (activeOnly && !r.still_active) return false;
      if (source !== 'all' && r.company_source !== source) return false;
      if (board !== 'all' && r.source_board !== board) return false;
      if (!q) return true;
      return (
        r.role_title?.toLowerCase().includes(q) ||
        r.company_name?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q)
      );
    });
  }, [roles, search, source, board, activeOnly]);

  return (
    <>
      {/* Filter bar */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
          <input
            className="input pl-8"
            placeholder="Search role, company or location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Filter size={12} style={{ color: 'var(--ink-faint)' }} />
          {(['all', 'ivylens', 'local'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`btn btn-sm ${source === s ? 'btn-cta' : 'btn-secondary'}`}
            >
              {s === 'all' ? 'All sources' : s === 'ivylens' ? 'IvyLens' : 'Local'}
            </button>
          ))}
        </div>

        {boards.length > 0 && (
          <select className="input" value={board} onChange={e => setBoard(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="all">All boards</option>
            {boards.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}

        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          Active only
        </label>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card empty-state">
          <p className="text-sm">No roles match the current filters.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Company</th>
                <th>Salary</th>
                <th>Location</th>
                <th>Source</th>
                <th>Scanned</th>
                <th>Origin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="font-medium" style={{ color: 'var(--ink)' }}>
                    {r.role_title ?? '—'}
                    {!r.still_active && <span className="badge badge-inactive text-[10px] ml-2">Closed</span>}
                  </td>
                  <td style={{ color: 'var(--ink-soft)' }}>
                    {r.company_id ? (
                      <Link href={`/clients/${r.company_id}`} prefetch={false} className="hover:underline" style={{ color: 'var(--purple)' }}>
                        {r.company_name}
                      </Link>
                    ) : (
                      r.company_name
                    )}
                  </td>
                  <td style={{ color: 'var(--ink-soft)' }}>{fmtSalary(r)}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{r.location ?? '—'}</td>
                  <td style={{ color: 'var(--ink-faint)' }}>{r.source_board ?? '—'}</td>
                  <td style={{ color: 'var(--ink-faint)' }}>{relative(r.scanned_at)}</td>
                  <td>
                    {r.company_source === 'ivylens' ? (
                      <span className="badge text-[10px]" style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
                        IvyLens
                      </span>
                    ) : (
                      <span className="badge text-[10px]" style={{ background: 'rgba(148,163,184,0.10)', color: 'var(--ink-faint)' }}>
                        Local
                      </span>
                    )}
                  </td>
                  <td>
                    {r.source_url ? (
                      <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="btn-icon" title="Open listing">
                        <ExternalLink size={13} />
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
