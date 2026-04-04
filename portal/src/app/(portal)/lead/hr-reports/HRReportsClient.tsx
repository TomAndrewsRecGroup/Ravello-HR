'use client';
import { useState, useMemo } from 'react';
import {
  TrendingUp, Users, BarChart3, Download, PieChart,
  Palmtree, Thermometer, Calendar,
} from 'lucide-react';
import { calculateLeaveBalance } from '@/lib/leaveCalculations';
import type { LeaveYearConfig } from '@/lib/leaveCalculations';

/* ─── Types ─────────────────────────────────────────── */
interface Employee {
  id: string;
  full_name: string;
  job_title: string;
  department: string | null;
  employment_type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  gender: string | null;
  ethnicity: string | null;
  disability_status: string | null;
  annual_leave_allowance: number;
  sick_day_allowance: number | null;
  leave_year_type: string;
  leave_year_start_month?: number;
  leave_year_start_day?: number;
}

interface LeaveRecord {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  employee_records?: { full_name: string; department: string | null } | null;
}

interface Props {
  employees: Employee[];
  leaveRecords: LeaveRecord[];
}

type ReportType = 'growth' | 'dei' | 'leave' | 'department';

/* ─── Helpers ───────────────────────────────────────── */
function groupBy<T>(arr: T[], key: (item: T) => string | null): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item) || 'Unknown';
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

function percent(val: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((val / total) * 100)}%`;
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Component ─────────────────────────────────────── */
export default function HRReportsClient({ employees, leaveRecords }: Props) {
  const [activeReport, setActiveReport] = useState<ReportType>('growth');

  const active = employees.filter(e => e.status !== 'terminated');
  const terminated = employees.filter(e => e.status === 'terminated');

  /* ─── Company Growth Data ───────────────────────── */
  const growthData = useMemo(() => {
    // Group employees by start month (all time)
    const months: Record<string, { joined: number; left: number }> = {};
    const now = new Date();
    const startYear = Math.min(...employees.map(e => new Date(e.start_date).getFullYear()), now.getFullYear() - 2);

    for (let y = startYear; y <= now.getFullYear(); y++) {
      for (let m = 0; m < 12; m++) {
        if (y === now.getFullYear() && m > now.getMonth()) break;
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        months[key] = { joined: 0, left: 0 };
      }
    }

    employees.forEach(emp => {
      const startKey = emp.start_date.slice(0, 7);
      if (months[startKey]) months[startKey].joined++;
      if (emp.end_date) {
        const endKey = emp.end_date.slice(0, 7);
        if (months[endKey]) months[endKey].left++;
      }
    });

    // Running headcount
    let headcount = 0;
    return Object.entries(months).sort().map(([month, { joined, left }]) => {
      headcount += joined - left;
      return { month, joined, left, headcount };
    });
  }, [employees]);

  /* ─── DE&I Data ─────────────────────────────────── */
  const deiData = useMemo(() => {
    const genderGroups = groupBy(active, e => e.gender);
    const ethnicityGroups = groupBy(active, e => e.ethnicity);
    const disabilityGroups = groupBy(active, e => e.disability_status);
    return { genderGroups, ethnicityGroups, disabilityGroups, total: active.length };
  }, [active]);

  /* ─── Leave Summary Data ────────────────────────── */
  const leaveSummary = useMemo(() => {
    const approvedLeave = leaveRecords.filter(r => r.status === 'approved');
    const byType = groupBy(approvedLeave, r => r.leave_type);
    const totalDays = approvedLeave.reduce((s, r) => s + r.days_count, 0);

    // Per-employee leave balances
    const balances = active.map(emp => {
      const empLeave = leaveRecords.filter(r => r.employee_id === emp.id);
      const config: LeaveYearConfig = {
        leave_year_type: emp.leave_year_type as 'rolling' | 'fixed',
        leave_year_start_month: emp.leave_year_start_month ?? 1,
        leave_year_start_day: emp.leave_year_start_day ?? 1,
        start_date: emp.start_date,
        annual_leave_allowance: emp.annual_leave_allowance,
        sick_day_allowance: emp.sick_day_allowance,
      };
      return { employee: emp, balance: calculateLeaveBalance(config, empLeave) };
    });

    return { byType, totalDays, balances };
  }, [active, leaveRecords]);

  /* ─── Department Data ───────────────────────────── */
  const departmentData = useMemo(() => {
    return groupBy(active, e => e.department);
  }, [active]);

  /* ─── CSV Exports ───────────────────────────────── */
  function exportGrowth() {
    downloadCSV('company-growth.csv',
      ['Month', 'Joined', 'Left', 'Headcount'],
      growthData.map(r => [r.month, String(r.joined), String(r.left), String(r.headcount)])
    );
  }

  function exportDEI() {
    downloadCSV('dei-report.csv',
      ['Name', 'Department', 'Gender', 'Ethnicity', 'Disability Status'],
      active.map(e => [e.full_name, e.department ?? '', e.gender ?? '', e.ethnicity ?? '', e.disability_status ?? ''])
    );
  }

  function exportLeave() {
    downloadCSV('leave-report.csv',
      ['Employee', 'Leave Type', 'Start', 'End', 'Days', 'Status'],
      leaveRecords.map(r => [
        (r.employee_records as any)?.full_name ?? '',
        r.leave_type.replace(/_/g, ' '),
        r.start_date, r.end_date,
        String(r.days_count), r.status,
      ])
    );
  }

  function exportDepartment() {
    downloadCSV('department-report.csv',
      ['Department', 'Employee Count', 'Employees'],
      Object.entries(departmentData).map(([dept, emps]) => [
        dept, String(emps.length), emps.map(e => e.full_name).join('; '),
      ])
    );
  }

  const REPORTS: { type: ReportType; label: string; icon: React.ElementType; desc: string }[] = [
    { type: 'growth',     label: 'Company Growth',  icon: TrendingUp,  desc: 'Headcount over time, joiners & leavers' },
    { type: 'dei',        label: 'DE&I Report',     icon: PieChart,    desc: 'Gender, ethnicity & disability breakdown' },
    { type: 'leave',      label: 'Leave & Absence', icon: Palmtree,    desc: 'Leave usage, sick days, balances' },
    { type: 'department', label: 'Departments',     icon: BarChart3,   desc: 'Headcount by department' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h2 className="section-title text-xl">HR Reports</h2>
      </div>

      {/* Report selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {REPORTS.map(r => (
          <button
            key={r.type}
            onClick={() => setActiveReport(r.type)}
            className="card p-4 text-left transition-all"
            style={{
              borderColor: activeReport === r.type ? 'var(--purple)' : undefined,
              boxShadow: activeReport === r.type ? '0 0 0 2px rgba(124,58,237,0.12)' : undefined,
            }}
          >
            <r.icon size={16} style={{ color: activeReport === r.type ? 'var(--purple)' : 'var(--ink-faint)' }} />
            <p className="text-sm font-semibold mt-2" style={{ color: 'var(--ink)' }}>{r.label}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{r.desc}</p>
          </button>
        ))}
      </div>

      {/* Report Content */}
      <div className="card p-6">
        {/* ── Company Growth ────────────────────────────── */}
        {activeReport === 'growth' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Company Growth</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  {active.length} active employees · {terminated.length} departed
                </p>
              </div>
              <button onClick={exportGrowth} className="btn-secondary btn-sm"><Download size={13} /> CSV</button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-lg p-3" style={{ background: 'rgba(52,211,153,0.08)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#047857' }}>Current Headcount</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#047857' }}>{active.length}</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(59,111,255,0.08)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#1848CC' }}>Joined This Year</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#1848CC' }}>
                  {employees.filter(e => e.start_date >= `${new Date().getFullYear()}-01-01`).length}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(217,68,68,0.06)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#B02020' }}>Left This Year</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#B02020' }}>
                  {terminated.filter(e => e.end_date && e.end_date >= `${new Date().getFullYear()}-01-01`).length}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400E' }}>On Probation</p>
                <p className="text-2xl font-bold mt-1" style={{ color: '#92400E' }}>
                  {employees.filter(e => e.status === 'probation').length}
                </p>
              </div>
            </div>

            {/* Growth table */}
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Joined</th>
                    <th>Left</th>
                    <th>Headcount</th>
                  </tr>
                </thead>
                <tbody>
                  {growthData.slice(-12).map(r => (
                    <tr key={r.month}>
                      <td className="font-medium">{r.month}</td>
                      <td>
                        {r.joined > 0 && <span style={{ color: '#047857' }}>+{r.joined}</span>}
                        {r.joined === 0 && <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                      </td>
                      <td>
                        {r.left > 0 && <span style={{ color: '#B02020' }}>-{r.left}</span>}
                        {r.left === 0 && <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                      </td>
                      <td className="font-bold">{r.headcount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DE&I Report ───────────────────────────────── */}
        {activeReport === 'dei' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Diversity, Equity & Inclusion</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  Based on {deiData.total} active employees
                </p>
              </div>
              <button onClick={exportDEI} className="btn-secondary btn-sm"><Download size={13} /> CSV</button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Gender */}
              <div>
                <h4 className="eyebrow mb-3">Gender</h4>
                <div className="space-y-2">
                  {Object.entries(deiData.genderGroups).sort((a, b) => b[1].length - a[1].length).map(([gender, emps]) => (
                    <div key={gender} className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--ink)' }}>{gender}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full rounded-full" style={{ width: percent(emps.length, deiData.total), background: 'var(--purple)' }} />
                        </div>
                        <span className="text-xs font-semibold w-10 text-right" style={{ color: 'var(--ink-soft)' }}>
                          {emps.length} ({percent(emps.length, deiData.total)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ethnicity */}
              <div>
                <h4 className="eyebrow mb-3">Ethnicity</h4>
                <div className="space-y-2">
                  {Object.entries(deiData.ethnicityGroups).sort((a, b) => b[1].length - a[1].length).map(([eth, emps]) => (
                    <div key={eth} className="flex items-center justify-between">
                      <span className="text-sm truncate max-w-[120px]" style={{ color: 'var(--ink)' }}>{eth}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full rounded-full" style={{ width: percent(emps.length, deiData.total), background: 'var(--blue)' }} />
                        </div>
                        <span className="text-xs font-semibold w-10 text-right" style={{ color: 'var(--ink-soft)' }}>
                          {emps.length}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Disability */}
              <div>
                <h4 className="eyebrow mb-3">Disability Status</h4>
                <div className="space-y-2">
                  {Object.entries(deiData.disabilityGroups).sort((a, b) => b[1].length - a[1].length).map(([status, emps]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--ink)' }}>{status}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full rounded-full" style={{ width: percent(emps.length, deiData.total), background: '#14B8A6' }} />
                        </div>
                        <span className="text-xs font-semibold w-10 text-right" style={{ color: 'var(--ink-soft)' }}>
                          {emps.length}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Leave & Absence ───────────────────────────── */}
        {activeReport === 'leave' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Leave & Absence Report</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  {leaveSummary.totalDays} total days taken across all types
                </p>
              </div>
              <button onClick={exportLeave} className="btn-secondary btn-sm"><Download size={13} /> CSV</button>
            </div>

            {/* Leave by type summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {Object.entries(leaveSummary.byType).map(([type, records]) => {
                const total = records.reduce((s, r) => s + r.days_count, 0);
                return (
                  <div key={type} className="rounded-lg p-3" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
                      {type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{total} <span className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>days</span></p>
                    <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{records.length} records</p>
                  </div>
                );
              })}
            </div>

            {/* Per-employee balance table */}
            <h4 className="eyebrow mb-3">Employee Leave Balances (Current Year)</h4>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>AL Entitlement</th>
                    <th>AL Taken</th>
                    <th>AL Remaining</th>
                    <th>Sick Taken</th>
                    <th>Sick Remaining</th>
                    <th>Pro-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveSummary.balances.map(({ employee, balance }) => (
                    <tr key={employee.id}>
                      <td>
                        <p className="font-medium">{employee.full_name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{employee.department ?? '—'}</p>
                      </td>
                      <td>{balance.annualLeaveAllowance}d</td>
                      <td>{balance.annualLeaveTaken}d</td>
                      <td style={{ color: balance.annualLeaveRemaining <= 2 ? '#B02020' : '#047857', fontWeight: 600 }}>
                        {balance.annualLeaveRemaining}d
                      </td>
                      <td>{balance.sickDaysTaken}d</td>
                      <td>{balance.sickDaysRemaining != null ? `${balance.sickDaysRemaining}d` : '—'}</td>
                      <td>
                        {balance.leaveYear.isProRata ? (
                          <span className="badge" style={{ background: 'rgba(59,111,255,0.08)', color: '#1848CC' }}>
                            {Math.round(balance.leaveYear.proRataFraction * 100)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Departments ───────────────────────────────── */}
        {activeReport === 'department' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Department Breakdown</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  {Object.keys(departmentData).length} departments · {active.length} active employees
                </p>
              </div>
              <button onClick={exportDepartment} className="btn-secondary btn-sm"><Download size={13} /> CSV</button>
            </div>

            <div className="space-y-4">
              {Object.entries(departmentData)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([dept, emps]) => (
                  <div key={dept}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{dept}</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--ink-faint)' }}>
                        {emps.length} employee{emps.length !== 1 ? 's' : ''} ({percent(emps.length, active.length)})
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full overflow-hidden mb-2" style={{ background: 'var(--line)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: percent(emps.length, active.length),
                          background: 'var(--gradient)',
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {emps.map(e => (
                        <span
                          key={e.id}
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}
                        >
                          {e.full_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
