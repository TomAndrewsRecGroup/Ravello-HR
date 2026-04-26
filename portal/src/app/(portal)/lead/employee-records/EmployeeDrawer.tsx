'use client';

import { X, Loader2 } from 'lucide-react';

// Form state shape mirrors the `emptyForm` in EmployeeRecordsClient. Kept
// here as a structural type so the parent can hand its existing form
// state object straight in without serialising.
export type EmployeeFormState = {
  full_name: string; email: string; phone: string; date_of_birth: string;
  gender: string; ethnicity: string; nationality: string; disability_status: string;
  employee_number: string; job_title: string; department: string; employment_type: string;
  status: string; start_date: string; end_date: string; probation_end: string;
  salary: string; salary_currency: string; pay_frequency: string;
  line_manager: string; work_location: string; contract_hours: string;
  emergency_name: string; emergency_phone: string; emergency_relation: string;
  ni_number: string; tax_code: string;
  annual_leave_allowance: string; sick_day_allowance: string;
  leave_year_type: string; leave_year_start_month: string; leave_year_start_day: string;
  notes: string; address: string;
};

interface Props {
  editingId: string | null;
  saving: boolean;
  form: EmployeeFormState;
  setField: (key: keyof EmployeeFormState, val: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function EmployeeDrawer({
  editingId, saving, form, setField, onClose, onSave,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl"
        style={{ animation: 'slideInRight 0.3s ease' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>
            {editingId ? 'Edit Employee' : 'Add Employee'}
          </h3>
          <button onClick={onClose} className="btn-icon">
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
                  <option value="">-</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Ethnicity</label>
                <select className="input" value={form.ethnicity} onChange={e => setField('ethnicity', e.target.value)}>
                  <option value="">-</option>
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
                  <option value="">-</option>
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
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving || !form.full_name.trim() || !form.job_title.trim() || !form.start_date}
            className="btn-cta btn-sm"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {editingId ? 'Update Employee' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}
