'use client';
import { useState, useMemo } from 'react';
import BDCompanyModal from '@/components/modules/BDCompanyModal';
import { Search, ChevronDown } from 'lucide-react';

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
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Contacted':     return 'badge-staff';
    case 'Client':        return 'badge-active';
    case 'Not Relevant':  return 'badge-inactive';
    default:              return 'badge-normal'; // Prospect
  }
}

const STATUS_OPTIONS = ['All', 'Prospect', 'Contacted', 'Client', 'Not Relevant'] as const;
const DATE_OPTIONS   = ['All time', 'Last 7 days', 'Last 30 days', 'Last 90 days'] as const;

export default function BDIntelligenceClient({ companies, roles }: Props) {
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState<string>('All');
  const [dateRange, setDateRange] = useState<string>('All time');
  const [modalCompany, setModalCompany] = useState<any | null>(null);

  const rolesByCompany = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of roles) {
      if (!map[r.company_id]) map[r.company_id] = [];
      map[r.company_id].push(r);
    }
    return map;
  }, [roles]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffMap: Record<string, number> = {
      'Last 7 days':  7,
      'Last 30 days': 30,
      'Last 90 days': 90,
    };
    const days = cutoffMap[dateRange];
    const cutoff = days ? now - days * 86400000 : null;

    return companies.filter((c: any) => {
      if (search && !c.company_name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (status !== 'All' && c.status !== status) return false;
      if (cutoff && c.first_seen_at && new Date(c.first_seen_at).getTime() < cutoff) return false;
      return true;
    });
  }, [companies, search, status, dateRange]);

  function getSalaryRange(companyRoles: any[]) {
    const active = companyRoles.filter(r => r.still_active);
    const salaries = active.map(r => [r.salary_min, r.salary_max]).flat().filter(Boolean) as number[];
    if (!salaries.length) return '—';
    const min = Math.min(...salaries);
    const max = Math.max(...salaries);
    const fmt = (n: number) => `£${(n / 1000).toFixed(0)}k`;
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  }

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
      </div>

      {/* Main table */}
      {filtered.length === 0 ? (
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
                    <td>
                      <span className={`badge ${statusBadgeClass(cStatus)}`}>{cStatus}</span>
                    </td>
                    <td>
                      <button
                        onClick={() => setModalCompany(c)}
                        className="btn-ghost btn-sm"
                      >
                        View Roles
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
