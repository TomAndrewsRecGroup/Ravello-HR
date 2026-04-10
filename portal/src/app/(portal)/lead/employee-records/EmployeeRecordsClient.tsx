'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import {
  Plus, Search, X, Loader2, Users, Mail, Phone,
  Building2, Calendar, ChevronRight, Filter,
} from 'lucide-react';
import Link from 'next/link';
import { calculateLeaveBalance } from '@/lib/leaveCalculations';
import type { LeaveRecordRow, LeaveYearConfig } from '@/lib/leaveCalculations';

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
  active:     { label: 'Active',     bg: 'rgba(52,211,153,0.12)', color: '#047857' },
  probation:  { label: 'Probation',  bg: 'rgba(245,158,11,0.12)', color: '#92400E' },
  on_leave:   { label: 'On Leave',   bg: 'rgba(59,111,255,0.12)', color: '#1848CC' },
  terminated: { label: 'Terminated', bg: 'rgba(217,68,68,0.08)',  color: '#B02020' },
};

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time:  'Full-time',
  part_time:  'Part-time',
  contractor: 'Contractor',
  intern:     'Intern',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
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

                  {/* Meta — hidden on mobile */}
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
                      <span className="text-xs font-semibold" style={{ color: bal.annualLeaveRemaining <= 2 ? '#B02020' : '#047857' }}>
                        {bal.annualLeaveRemaining}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>/ {bal.annualLeaveAllowance} days left</span>
                      {bal.leaveYear.isProRata && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,111,255,0.08)', color: '#1848CC' }}>pro-rata</span>
                      )}
                    </div>
                    {bal.sickDayAllowance != null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Sick</span>
                        <span className="text-xs font-semibold" style={{ color: bal.sickDaysRemaining != null && bal.sickDaysRemaining <= 1 ? '#B02020' : 'var(--ink-soft)' }}>
                          {bal.sickDaysRemaining ?? '—'}
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

      {/* ─── Add / Edit Drawer ─────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div
            className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl"
            style={{ animation: 'slideInRight 0.3s ease' }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>
                {editingId ? 'Edit Employee' : 'Add Employee'}
              </h3>
              <button onClick={() => setShowForm(false)} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Personal Information */}
              <fieldset>
                <legend className="eyebrow mb-3">Personal Information</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="form-group sm:col-span-2">
                    <label className="label">Full Name *</label>
                    <input className="input" value={form.full_name} onChange={e => setField('full_name', e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="label">Email</label>
                    <input className="input" type="email" value={form.email} onChange={e => setField('email', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Phone</label>
                    <input className="input" value={form.phone} onChange={e => setField('phone', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Date of Birth</label>
                    <input className="input" type="date" value={form.date_of_birth} onChange={e => setField('date_of_birth', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Gender</label>
                    <select className="input" value={form.gender} onChange={e => setField('gender', e.target.value)}>
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Ethnicity</label>
                    <select className="input" value={form.ethnicity} onChange={e => setField('ethnicity', e.target.value)}>
                      <option value="">—</option>
                      <option value="White British">White British</option>
                      <option value="White Irish">White Irish</option>
                      <option value="White Other">White Other</option>
                      <option value="Mixed / Multiple Ethnic">Mixed / Multiple Ethnic</option>
                      <option value="Asian / Asian British">Asian / Asian British</option>
                      <option value="Black / African / Caribbean">Black / African / Caribbean</option>
                      <option value="Arab">Arab</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Nationality</label>
                    <input className="input" value={form.nationality} onChange={e => setField('nationality', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Disability Status</label>
                    <select className="input" value={form.disability_status} onChange={e => setField('disability_status', e.target.value)}>
                      <option value="">—</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div className="form-group sm:col-span-2">
                    <label className="label">Address</label>
                    <textarea className="input" rows={2} value={form.address} onChange={e => setField('address', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              <div className="divider-gradient" />

              {/* Employment Details */}
              <fieldset>
                <legend className="eyebrow mb-3">Employment Details</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="label">Employee Number</label>
                    <input className="input" value={form.employee_number} onChange={e => setField('employee_number', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Job Title *</label>
                    <input className="input" value={form.job_title} onChange={e => setField('job_title', e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="label">Department</label>
                    <input className="input" value={form.department} onChange={e => setField('department', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Employment Type</label>
                    <select className="input" value={form.employment_type} onChange={e => setField('employment_type', e.target.value)}>
                      <option value="full_time">Full-time</option>
                      <option value="part_time">Part-time</option>
                      <option value="contractor">Contractor</option>
                      <option value="intern">Intern</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={e => setField('status', e.target.value)}>
                      <option value="active">Active</option>
                      <option value="probation">Probation</option>
                      <option value="on_leave">On Leave</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Start Date *</label>
                    <input className="input" type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="label">End Date</label>
                    <input className="input" type="date" value={form.end_date} onChange={e => setField('end_date', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Probation End</label>
                    <input className="input" type="date" value={form.probation_end} onChange={e => setField('probation_end', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Line Manager</label>
                    <input className="input" value={form.line_manager} onChange={e => setField('line_manager', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Work Location</label>
                    <input className="input" value={form.work_location} onChange={e => setField('work_location', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Contract Hours / Week</label>
                    <input className="input" type="number" step="0.5" value={form.contract_hours} onChange={e => setField('contract_hours', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              <div className="divider-gradient" />

              {/* Pay */}
              <fieldset>
                <legend className="eyebrow mb-3">Pay</legend>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="form-group">
                    <label className="label">Salary</label>
                    <input className="input" type="number" step="0.01" value={form.salary} onChange={e => setField('salary', e.target.value)} placeholder="e.g. 35000" />
                  </div>
                  <div className="form-group">
                    <label className="label">Currency</label>
                    <select className="input" value={form.salary_currency} onChange={e => setField('salary_currency', e.target.value)}>
                      <option value="GBP">GBP</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Pay Frequency</label>
                    <select className="input" value={form.pay_frequency} onChange={e => setField('pay_frequency', e.target.value)}>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Fortnightly</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <div className="divider-gradient" />

              {/* Leave Configuration */}
              <fieldset>
                <legend className="eyebrow mb-3">Leave Allowance</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="label">Annual Leave (days / year)</label>
                    <input className="input" type="number" step="0.5" value={form.annual_leave_allowance} onChange={e => setField('annual_leave_allowance', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Sick Day Allowance (blank = no limit)</label>
                    <input className="input" type="number" step="0.5" value={form.sick_day_allowance} onChange={e => setField('sick_day_allowance', e.target.value)} placeholder="e.g. 10" />
                  </div>
                  <div className="form-group">
                    <label className="label">Leave Year Type</label>
                    <select className="input" value={form.leave_year_type} onChange={e => setField('leave_year_type', e.target.value)}>
                      <option value="rolling">Rolling 12 months (from start date)</option>
                      <option value="fixed">Fixed year (set start month)</option>
                    </select>
                  </div>
                  {form.leave_year_type === 'fixed' && (
                    <>
                      <div className="form-group">
                        <label className="label">Leave Year Start Month</label>
                        <select className="input" value={form.leave_year_start_month} onChange={e => setField('leave_year_start_month', e.target.value)}>
                          {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                            <option key={m} value={String(i + 1)}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="label">Leave Year Start Day</label>
                        <input className="input" type="number" min="1" max="31" value={form.leave_year_start_day} onChange={e => setField('leave_year_start_day', e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
                {form.leave_year_type === 'fixed' && form.start_date && (
                  <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(59,111,255,0.06)', color: 'var(--blue)' }}>
                    Pro-rata leave will be calculated automatically based on the start date relative to the leave year.
                  </div>
                )}
              </fieldset>

              <div className="divider-gradient" />

              {/* Tax & NI */}
              <fieldset>
                <legend className="eyebrow mb-3">Tax &amp; National Insurance</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="label">NI Number</label>
                    <input className="input" value={form.ni_number} onChange={e => setField('ni_number', e.target.value)} placeholder="e.g. AB123456C" />
                  </div>
                  <div className="form-group">
                    <label className="label">Tax Code</label>
                    <input className="input" value={form.tax_code} onChange={e => setField('tax_code', e.target.value)} placeholder="e.g. 1257L" />
                  </div>
                </div>
              </fieldset>

              <div className="divider-gradient" />

              {/* Emergency Contact */}
              <fieldset>
                <legend className="eyebrow mb-3">Emergency Contact</legend>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="form-group">
                    <label className="label">Name</label>
                    <input className="input" value={form.emergency_name} onChange={e => setField('emergency_name', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Phone</label>
                    <input className="input" value={form.emergency_phone} onChange={e => setField('emergency_phone', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Relationship</label>
                    <input className="input" value={form.emergency_relation} onChange={e => setField('emergency_relation', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              <div className="divider-gradient" />

              {/* Notes */}
              <fieldset>
                <legend className="eyebrow mb-3">Notes</legend>
                <textarea className="input" rows={3} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Any additional notes..." />
              </fieldset>
            </div>

            {/* Save bar */}
            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 px-6 py-4 bg-white" style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.full_name.trim() || !form.job_title.trim() || !form.start_date}
                className="btn-cta btn-sm"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {editingId ? 'Update Employee' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
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
