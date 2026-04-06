'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, X } from 'lucide-react';

interface Props {
  candidateId: string;
  candidateName: string;
  requisitionId: string;
  companyId: string;
  jobTitle?: string;
  department?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function HiredModal({
  candidateId,
  candidateName,
  requisitionId,
  companyId,
  jobTitle: initialJobTitle,
  department: initialDepartment,
  onClose,
  onSaved,
}: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(candidateName);
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState(initialJobTitle ?? '');
  const [department, setDepartment] = useState(initialDepartment ?? '');
  const [startDate, setStartDate] = useState('');
  const [employmentType, setEmploymentType] = useState('full-time');
  const [annualSalary, setAnnualSalary] = useState('');
  const [reportingManager, setReportingManager] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const salary = annualSalary ? parseFloat(annualSalary) : null;

      // Insert employee record
      const { error: insertErr } = await supabase
        .from('employee_records')
        .insert({
          company_id: companyId,
          full_name: fullName,
          email,
          job_title: jobTitle,
          department,
          start_date: startDate || null,
          employment_type: employmentType,
          annual_salary: salary,
          reporting_manager: reportingManager || null,
          status: 'active',
        });

      if (insertErr) throw insertErr;

      // Update candidate status to hired
      const { error: candErr } = await supabase
        .from('candidates')
        .update({ client_status: 'hired' })
        .eq('id', candidateId);

      if (candErr) throw candErr;

      // Update requisition stage to filled
      const { error: reqErr } = await supabase
        .from('requisitions')
        .update({ stage: 'filled' })
        .eq('id', requisitionId);

      if (reqErr) throw reqErr;

      onSaved();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to save employee record';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(7,11,29,0.45)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg mx-4 overflow-y-auto max-h-[calc(100vh-80px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Mark as Hired
          </h2>
          <button onClick={onClose} className="btn-icon btn-ghost">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>
          Create an employee record for <strong>{candidateName}</strong>. This will also mark the
          role as filled.
        </p>

        {error && (
          <div
            className="text-sm rounded-lg px-3 py-2 mb-4"
            style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {/* Full Name */}
          <div>
            <label className="label">Full Name</label>
            <input
              className="input w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="label">Email</label>
            <input
              className="input w-full"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Job Title */}
          <div>
            <label className="label">Job Title</label>
            <input
              className="input w-full"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="From the role"
              required
            />
          </div>

          {/* Department */}
          <div>
            <label className="label">Department</label>
            <input
              className="input w-full"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="label">Start Date</label>
            <input
              className="input w-full"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Employment Type */}
          <div>
            <label className="label">Employment Type</label>
            <select
              className="input w-full"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            >
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="fixed-term">Fixed-term</option>
            </select>
          </div>

          {/* Annual Salary */}
          <div>
            <label className="label">Annual Salary</label>
            <input
              className="input w-full"
              type="number"
              min="0"
              step="0.01"
              value={annualSalary}
              onChange={(e) => setAnnualSalary(e.target.value)}
              placeholder="e.g. 45000"
            />
          </div>

          {/* Reporting Manager */}
          <div>
            <label className="label">Reporting Manager</label>
            <input
              className="input w-full"
              value={reportingManager}
              onChange={(e) => setReportingManager(e.target.value)}
              placeholder="Manager name"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-cta btn-sm flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving...' : 'Create Employee Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
