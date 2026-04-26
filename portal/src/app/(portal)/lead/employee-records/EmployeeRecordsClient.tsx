'use client';
import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import {
  Plus, Search, Users, Mail,
  Calendar, ChevronRight,
} from 'lucide-react';
import { calculateLeaveBalance } from '@/lib/leaveCalculations';
import type { LeaveYearConfig } from '@/lib/leaveCalculations';

// Drawer is the single biggest part of this page (~280 lines, ~30 form
// fields). Lazy-loading defers parsing/hydration of all that until the
// user actually opens it via "Add Employee" or row-click.
const EmployeeDrawer = dynamic(() => import('./EmployeeDrawer'), { ssr: false });

/* ─── Types ─────────────────────────────────────────── */
interface LeaveRecord {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
}
interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string;
  department: string | null;
  employment_type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  gender: string | null;
  ethnicity: string | null;
  annual_leave_allowance: number;
  sick_day_allowance: number | null;
  leave_year_type: string;
  created_at: string;
}

interface Props {
  companyId: string;
  userId: string;
  isAdmin: boolean;
  initialEmployees: Employee[];
  leaveRecords: LeaveRecord[];
}

/* ─── Constants ─────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  active:     { label: 'Active',     bg: 'rgba(52,211,153,0.12)', color: 'var(--emerald)' },
  probation:  { label: 'Probation',  bg: 'rgba(245,158,11,0.12)', color: '#92400E' },
  on_leave:   { label: 'On Leave',   bg: 'rgba(59,111,255,0.12)', color: 'var(--blue)' },
  terminated: { label: 'Terminated', bg: 'rgba(217,68,68,0.08)',  color: 'var(--rose)' },
};

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time:  'Full-time',
  part_time:  'Part-time',
  contractor: 'Contractor',
  intern:     'Intern',
};

function fmtDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─── Component ─────────────────────────────────────── */
export default function EmployeeRecordsClient({ companyId, userId, isAdmin, initialEmployees, leaveRecords }: Props) {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Derive departments for filter
  const departments = useMemo(() => {
    const depts = new Set(employees.map(e => e.department).filter(Boolean) as string[]);
    return Array.from(depts).sort();
  }, [employees]);

  // Filtered employees
  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (deptFilter !== 'all' && e.department !== deptFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.full_name.toLowerCase().includes(q) ||
          (e.email?.toLowerCase().includes(q)) ||
          (e.job_title?.toLowerCase().includes(q)) ||
          (e.department?.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [employees, search, statusFilter, deptFilter]);

  // Stats
  const activeCount = employees.filter(e => e.status === 'active').length;
  const onLeaveCount = employees.filter(e => e.status === 'on_leave').length;
  const probationCount = employees.filter(e => e.status === 'probation').length;

  // Leave balance helper
  function getLeaveBalance(emp: Employee) {
    const empLeave = leaveRecords.filter(r => r.employee_id === emp.id);
    const config: LeaveYearConfig = {
      leave_year_type: emp.leave_year_type as 'rolling' | 'fixed',
      leave_year_start_month: (emp as any).leave_year_start_month ?? 1,
      leave_year_start_day: (emp as any).leave_year_start_day ?? 1,
      start_date: emp.start_date,
      annual_leave_allowance: emp.annual_leave_allowance,
      sick_day_allowance: emp.sick_day_allowance,
    };
    return calculateLeaveBalance(config, empLeave);
  }

  /* ─── Form state ──────────────────────────────────── */
  const emptyForm = {
    full_name: '', email: '', phone: '', date_of_birth: '',
    gender: '', ethnicity: '', nationality: '', disability_status: '',
    employee_number: '', job_title: '', department: '', employment_type: 'full_time',
    status: 'active', start_date: '', end_date: '', probation_end: '',
    salary: '', salary_currency: 'GBP', pay_frequency: 'monthly',
    line_manager: '', work_location: '', contract_hours: '37.5',
    emergency_name: '', emergency_phone: '', emergency_relation: '',
    ni_number: '', tax_code: '',
    annual_leave_allowance: '28', sick_day_allowance: '',
    leave_year_type: 'fixed', leave_year_start_month: '1', leave_year_start_day: '1',
    notes: '', address: '',
  };
  const [form, setForm] = useState(emptyForm);

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setForm({
      full_name: emp.full_name,
      email: emp.email ?? '',
      phone: emp.phone ?? '',
      date_of_birth: (emp as any).date_of_birth ?? '',
      gender: emp.gender ?? '',
      ethnicity: emp.ethnicity ?? '',
      nationality: (emp as any).nationality ?? '',
      disability_status: (emp as any).disability_status ?? '',
      employee_number: (emp as any).employee_number ?? '',
      job_title: emp.job_title,
      department: emp.department ?? '',
      employment_type: emp.employment_type,
      status: emp.status,
      start_date: emp.start_date,
      end_date: emp.end_date ?? '',
      probation_end: (emp as any).probation_end ?? '',
      salary: (emp as any).salary?.toString() ?? '',
      salary_currency: (emp as any).salary_currency ?? 'GBP',
      pay_frequency: (emp as any).pay_frequency ?? 'monthly',
      line_manager: (emp as any).line_manager ?? '',
      work_location: (emp as any).work_location ?? '',
      contract_hours: (emp as any).contract_hours?.toString() ?? '37.5',
      emergency_name: (emp as any).emergency_name ?? '',
      emergency_phone: (emp as any).emergency_phone ?? '',
      emergency_relation: (emp as any).emergency_relation ?? '',
      ni_number: (emp as any).ni_number ?? '',
      tax_code: (emp as any).tax_code ?? '',
      annual_leave_allowance: emp.annual_leave_allowance?.toString() ?? '28',
      sick_day_allowance: emp.sick_day_allowance?.toString() ?? '',
      leave_year_type: emp.leave_year_type ?? 'fixed',
      leave_year_start_month: (emp as any).leave_year_start_month?.toString() ?? '1',
      leave_year_start_day: (emp as any).leave_year_start_day?.toString() ?? '1',
      notes: (emp as any).notes ?? '',
      address: (emp as any).address ?? '',
    });
    setEditingId(emp.id);
    setShowForm(true);
  }

  function setField(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.job_title.trim() || !form.start_date) return;
    setSaving(true);

    const payload = {
      company_id: companyId,
      full_name: form.full_name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      ethnicity: form.ethnicity || null,
      nationality: form.nationality || null,
      disability_status: form.disability_status || null,
      employee_number: form.employee_number || null,
      job_title: form.job_title.trim(),
      department: form.department || null,
      employment_type: form.employment_type,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date || null,
      probation_end: form.probation_end || null,
      salary: form.salary ? parseFloat(form.salary) : null,
      salary_currency: form.salary_currency,
      pay_frequency: form.pay_frequency,
      line_manager: form.line_manager || null,
      work_location: form.work_location || null,
      contract_hours: form.contract_hours ? parseFloat(form.contract_hours) : null,
      emergency_name: form.emergency_name || null,
      emergency_phone: form.emergency_phone || null,
      emergency_relation: form.emergency_relation || null,
      ni_number: form.ni_number || null,
      tax_code: form.tax_code || null,
      annual_leave_allowance: parseFloat(form.annual_leave_allowance) || 28,
      sick_day_allowance: form.sick_day_allowance ? parseFloat(form.sick_day_allowance) : null,
      leave_year_type: form.leave_year_type,
      leave_year_start_month: parseInt(form.leave_year_start_month) || 1,
      leave_year_start_day: parseInt(form.leave_year_start_day) || 1,
      notes: form.notes || null,
      address: form.address || null,
    };

    if (editingId) {
      const { data, error } = await supabase
        .from('employee_records')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single();
      if (!error && data) {
        setEmployees(prev => prev.map(e => e.id === editingId ? data as Employee : e));
        setShowForm(false);
        revalidatePortalPath('/lead/employee-records');
      }
    } else {
      const { data, error } = await supabase
        .from('employee_records')
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        setEmployees(prev => [...prev, data as Employee]);
        setShowForm(false);
        revalidatePortalPath('/lead/employee-records');
      }
    }

    setSaving(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Employee Records</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            {activeCount} active · {onLeaveCount} on leave · {probationCount} probation
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="btn-cta btn-sm">
            <Plus size={14} /> Add Employee
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
          <input
            type="text"
            placeholder="Search by name, email, job title..."
            className="input pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          style={{ minWidth: 140 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="on_leave">On Leave</option>
          <option value="terminated">Terminated</option>
        </select>
        {departments.length > 0 && (
          <select
            className="input w-auto"
            style={{ minWidth: 140 }}
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* Employee List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <Users size={28} />
          <p className="text-sm font-medium">No employees found</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            {employees.length === 0
              ? 'Add your first employee record to get started.'
              : 'Try adjusting your search or filters.'}
          </p>
          {employees.length === 0 && isAdmin && (
            <button onClick={openNew} className="btn-cta btn-sm mt-3">
              <Plus size={14} /> Add Employee
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => {
            const st = STATUS_CONFIG[emp.status] ?? STATUS_CONFIG.active;
            const bal = getLeaveBalance(emp);
            return (
              <div
                key={emp.id}
                className="card p-4 cursor-pointer hover:shadow-md transition-all"
                onClick={() => openEdit(emp)}
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}
                  >
                    {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                        {emp.full_name}
                      </p>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-faint)' }}>
                      {emp.job_title}
                      {emp.department ? ` · ${emp.department}` : ''}
                      {' · '}
                      {EMP_TYPE_LABELS[emp.employment_type] ?? emp.employment_type}
                    </p>
                  </div>

                  {/* Meta: hidden on mobile */}
                  <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                    {emp.email && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                        <Mail size={11} /> {emp.email}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    <Calendar size={11} /> {fmtDate(emp.start_date)}
                  </span>
                </div>

                  <ChevronRight size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                </div>

                {/* Leave balance bar */}
                {emp.status !== 'terminated' && (
                  <div className="flex flex-wrap items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Annual Leave</span>
                      <span className="text-xs font-semibold" style={{ color: bal.annualLeaveRemaining <= 2 ? 'var(--rose)' : 'var(--emerald)' }}>
                        {bal.annualLeaveRemaining}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>/ {bal.annualLeaveAllowance} days left</span>
                      {bal.leaveYear.isProRata && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,111,255,0.08)', color: 'var(--blue)' }}>pro-rata</span>
                      )}
                    </div>
                    {bal.sickDayAllowance != null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Sick</span>
                        <span className="text-xs font-semibold" style={{ color: bal.sickDaysRemaining != null && bal.sickDaysRemaining <= 1 ? 'var(--rose)' : 'var(--ink-soft)' }}>
                          {bal.sickDaysRemaining ?? '-'}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>/ {bal.sickDayAllowance} left</span>
                      </div>
                    )}
                    {bal.annualLeavePending > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.10)', color: '#92400E' }}>
                        {bal.annualLeavePending}d pending
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Add / Edit Drawer (lazy-loaded) ─────────── */}
      {showForm && (
        <EmployeeDrawer
          editingId={editingId}
          saving={saving}
          form={form}
          setField={(k, v) => setField(k as string, v)}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
