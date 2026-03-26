'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import BDCompanyModal from '@/components/modules/BDCompanyModal';
import { Search, ChevronDown, LayoutList, Columns3 } from 'lucide-react';

interface Props {
  companies: any[];
  roles: any[];
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Contacted':     return 'badge-staff';
    case 'Client':        return 'badge-active';
    case 'Not Relevant':  return 'badge-inactive';
    default:              return 'badge-normal';
  }
}

const STATUS_OPTIONS = ['All', 'Prospect', 'Contacted', 'Client', 'Not Relevant'] as const;
const DATE_OPTIONS   = ['All time', 'Last 7 days', 'Last 30 days', 'Last 90 days'] as const;

const KANBAN_COLS = [
  { key: 'Prospect',     label: 'Prospect',     color: '#748099', bg: 'rgba(148,163,184,0.08)' },
  { key: 'Contacted',    label: 'Contacted',    color: '#3B6FFF', bg: 'rgba(59,111,255,0.06)'  },
  { key: 'Client',       label: 'Client',       color: '#16A34A', bg: 'rgba(22,163,74,0.06)'   },
  { key: 'Not Relevant', label: 'Not Relevant', color: '#94A3B8', bg: 'rgba(148,163,184,0.04)' },
];

export default function BDIntelligenceClient({ companies: initialCompanies, roles }: Props) {
  const supabase = createClient();
  const [companies, setCompanies]       = useState<any[]>(initialCompanies);
  const [search,    setSearch]          = useState('');
  const [status,    setStatus]          = useState<string>('All');
  const [dateRange, setDateRange]       = useState<string>('All time');
  const [view,      setView]            = useState<'table' | 'kanban'>('table');
  const [modalCompany, setModalCompany] = useState<any | null>(null);
  const [dragging,     setDragging]    = useState<string | null>(null);

  const rolesByCompany = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of roles) {
      if (!map[r.company_id]) map[r.company_id] = [];
      map[r.company_id].push(r);
    }
    return map;
  }, [roles]);

  const filtered = useMemo(() => {
    const cutoffMap: Record<string, number> = { 'Last 7 days': 7, 'Last 30 days': 30, 'Last 90 days': 90 };
    const days   = cutoffMap[dateRange];
    const cutoff = days ? Date.now() - days * 86400000 : null;

    return companies.filter((c: any) => {
      if (search && !c.company_name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (view === 'table' && status !== 'All' && c.status !== status) return false;
      if (cutoff && c.first_seen_at && new Date(c.first_seen_at).getTime() < cutoff) return false;
      return true;
    });
  }, [companies, search, status, dateRange, view]);

  function getSalaryRange(companyRoles: any[]) {
    const salaries = companyRoles.filter(r => r.still_active).flatMap(r => [r.salary_min, r.salary_max]).filter(Boolean) as number[];
    if (!salaries.length) return '—';
    const min = Math.min(...salaries);
    const max = Math.max(...salaries);
    const fmt = (n: number) => `£${(n / 1000).toFixed(0)}k`;
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  }

  async function moveToStatus(companyId: string, newStatus: string) {
    await supabase.from('bd_companies').update({ status: newStatus }).eq('id', companyId);
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, status: newStatus } : c));
  }

  /* ─── Drag handlers ──────────────────────────────── */
  function onDragStart(companyId: string) { setDragging(companyId); }

  function onDrop(colKey: string) {
    if (!dragging) return;
    moveToStatus(dragging, colKey);
    setDragging(null);
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); }

  return (
    <>
      {/* Filter bar */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
          <input
            className="input pl-8"
            placeholder="Search companies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {view === 'table' && (
          <div className="flex items-center gap-2">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`btn btn-sm ${status === s ? 'btn-cta' : 'btn-secondary'}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <select
            className="input pr-8 appearance-none cursor-pointer"
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            {DATE_OPTIONS.map(d => <option key={d}>{d}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-faint)' }} />
        </div>

        {/* View toggle */}
        <div className="flex rounded-[8px] overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          <button
            onClick={() => setView('table')}
            className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition-colors"
            style={{ background: view === 'table' ? 'var(--purple)' : 'transparent', color: view === 'table' ? '#fff' : 'var(--ink-soft)' }}
          >
            <LayoutList size={13} /> Table
          </button>
          <button
            onClick={() => setView('kanban')}
            className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition-colors"
            style={{ background: view === 'kanban' ? 'var(--purple)' : 'transparent', color: view === 'kanban' ? '#fff' : 'var(--ink-soft)' }}
          >
            <Columns3 size={13} /> Kanban
          </button>
        </div>
      </div>

      {/* ─── Table view ──────────────────────────────── */}
      {view === 'table' && (
        filtered.length === 0 ? (
          <div className="card empty-state">No companies match the current filters.</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Active Roles</th>
                  <th>Total Seen</th>
                  <th>Top Roles</th>
                  <th>Salary Range</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => {
                  const compRoles   = rolesByCompany[c.id] ?? [];
                  const activeCount = compRoles.filter((r: any) => r.still_active).length;
                  const titles      = [...new Set(compRoles.map((r: any) => r.role_title).filter(Boolean))];
                  const topRoles    = titles.slice(0, 2).join(', ');
                  const moreCount   = titles.length - 2;
                  const salary      = getSalaryRange(compRoles);
                  const cStatus     = c.status ?? 'Prospect';
                  return (
                    <tr key={c.id}>
                      <td>
                        <p className="font-semibold" style={{ color: 'var(--ink)' }}>{c.company_name ?? '—'}</p>
                        {c.domain && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{c.domain}</p>}
                      </td>
                      <td>
                        <span className="font-medium" style={{ color: activeCount > 0 ? 'var(--purple)' : 'var(--ink-faint)' }}>
                          {activeCount}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }}>{c.total_roles_seen ?? 0}</td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                          {topRoles || '—'}
                          {moreCount > 0 && <span className="ml-1 text-xs" style={{ color: 'var(--ink-faint)' }}>+{moreCount} more</span>}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }}>{salary}</td>
                      <td style={{ color: 'var(--ink-faint)' }}>{relativeTime(c.last_seen_at)}</td>
                      <td><span className={`badge ${statusBadgeClass(cStatus)}`}>{cStatus}</span></td>
                      <td>
                        <button onClick={() => setModalCompany(c)} className="btn-ghost btn-sm">View Roles</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── Kanban view ─────────────────────────────── */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
          {KANBAN_COLS.map(col => {
            const colCompanies = filtered.filter(c => (c.status ?? 'Prospect') === col.key);
            const isDragTarget = dragging !== null;
            return (
              <div
                key={col.key}
                className="flex-shrink-0 flex flex-col"
                style={{ width: 260 }}
                onDragOver={onDragOver}
                onDrop={() => onDrop(col.key)}
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-t-[10px] mb-2"
                  style={{ background: col.bg, border: `1px solid ${col.color}22` }}
                >
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: `${col.color}22`, color: col.color }}
                  >
                    {colCompanies.length}
                  </span>
                </div>

                {/* Drop zone */}
                <div
                  className="flex-1 rounded-b-[10px] p-2 space-y-2 transition-colors"
                  style={{
                    background: isDragTarget ? `${col.color}08` : 'var(--surface-alt)',
                    border: `1px dashed ${isDragTarget ? col.color : 'transparent'}`,
                    borderTop: 'none',
                    minHeight: 200,
                  }}
                >
                  {colCompanies.length === 0 && (
                    <p className="text-center text-xs py-8" style={{ color: 'var(--ink-faint)' }}>
                      Drop here
                    </p>
                  )}
                  {colCompanies.map((c: any) => {
                    const compRoles   = rolesByCompany[c.id] ?? [];
                    const activeCount = compRoles.filter((r: any) => r.still_active).length;
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => onDragStart(c.id)}
                        onDragEnd={() => setDragging(null)}
                        className="card p-3 cursor-grab active:cursor-grabbing select-none"
                        style={{
                          opacity: dragging === c.id ? 0.4 : 1,
                          borderLeft: `3px solid ${col.color}`,
                        }}
                      >
                        <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>{c.company_name}</p>
                        {c.domain && <p className="text-xs mb-2" style={{ color: 'var(--ink-faint)' }}>{c.domain}</p>}
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                            {activeCount > 0 ? `${activeCount} active role${activeCount > 1 ? 's' : ''}` : 'No active roles'}
                          </span>
                          <button
                            onClick={() => setModalCompany(c)}
                            className="text-xs font-medium"
                            style={{ color: 'var(--purple)' }}
                          >
                            View →
                          </button>
                        </div>
                        {c.last_seen_at && (
                          <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                            {relativeTime(c.last_seen_at)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalCompany && (
        <BDCompanyModal
          company={modalCompany}
          onClose={() => setModalCompany(null)}
        />
      )}
    </>
  );
}
