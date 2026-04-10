'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import { createClient } from '@/lib/supabase/client';
import {
  FileText, BarChart2, Users, Calendar, ClipboardList, LifeBuoy,
  CheckCircle2, Loader2, ArrowLeft,
} from 'lucide-react';

// ── Request type definitions ─────────────────────────────────────────────────

const REQUEST_TYPES = [
  {
    id:          'policy_update',
    label:       'Request a Policy Update',
    description: 'Need a new policy or an existing one amended?',
    icon:        FileText,
    color:       'var(--purple)',
  },
  {
    id:          'salary_benchmark',
    label:       'Request Salary Benchmark',
    description: 'Get market-rate data for a specific role.',
    icon:        BarChart2,
    color:       'var(--teal)',
  },
  {
    id:          'manager_support',
    label:       'Request Manager Support',
    description: 'Guidance on a people situation or management challenge.',
    icon:        Users,
    color:       'var(--blue)',
  },
  {
    id:          'strategic_review',
    label:       'Book a Strategic Review',
    description: 'Schedule time with The People Office to plan ahead.',
    icon:        Calendar,
    color:       'var(--warning)',
  },
  {
    id:          'hr_audit',
    label:       'Request HR Audit',
    description: 'A full review of your current HR policies and processes.',
    icon:        ClipboardList,
    color:       'var(--danger)',
  },
  {
    id:          'support_query',
    label:       'Raise a Support Query',
    description: 'General question or request not covered above.',
    icon:        LifeBuoy,
    color:       'var(--ink-soft)',
  },
] as const;

type RequestTypeId = typeof REQUEST_TYPES[number]['id'];

const URGENCY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent'];
const SENIORITY_OPTIONS = ['Junior', 'Mid', 'Senior', 'Lead', 'Head of', 'Director', 'C-Level'];
const COMPANY_SIZES = ['Under 20', '20–50', '50–150', '150+'];

// ── Per-type form fields ─────────────────────────────────────────────────────

function PolicyUpdateForm({ fields, set }: { fields: any; set: (k: string, v: string) => void }) {
  return (
    <>
      <div className="form-group">
        <label className="label">Which policy? *</label>
        <input required className="input" value={fields.policy_name ?? ''} onChange={e => set('policy_name', e.target.value)} placeholder="e.g. Remote Working Policy" />
      </div>
      <div className="form-group">
        <label className="label">What change is needed? *</label>
        <textarea required rows={4} className="input" value={fields.change_needed ?? ''} onChange={e => set('change_needed', e.target.value)} placeholder="Describe the update required…" />
      </div>
      <div className="form-group">
        <label className="label">Urgency</label>
        <select className="input" value={fields.urgency ?? 'Normal'} onChange={e => set('urgency', e.target.value)}>
          {URGENCY_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </>
  );
}

function SalaryBenchmarkForm({ fields, set }: { fields: any; set: (k: string, v: string) => void }) {
  return (
    <>
      <div className="form-group">
        <label className="label">Role title *</label>
        <input required className="input" value={fields.role_title ?? ''} onChange={e => set('role_title', e.target.value)} placeholder="e.g. Head of Finance" />
      </div>
      <div className="form-group">
        <label className="label">Location *</label>
        <input required className="input" value={fields.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="e.g. London / Remote" />
      </div>
      <div className="form-group">
        <label className="label">Seniority level</label>
        <select className="input" value={fields.seniority ?? ''} onChange={e => set('seniority', e.target.value)}>
          <option value="">Select…</option>
          {SENIORITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </>
  );
}

function ManagerSupportForm({ fields, set }: { fields: any; set: (k: string, v: string) => void }) {
  const remaining = 300 - (fields.situation ?? '').length;
  return (
    <>
      <div className="form-group">
        <label className="label">Describe the situation *</label>
        <textarea
          required rows={5}
          className="input"
          maxLength={300}
          value={fields.situation ?? ''}
          onChange={e => set('situation', e.target.value)}
          placeholder="What's happening? Include any relevant context…"
        />
        <p className="text-xs mt-1" style={{ color: remaining < 50 ? 'var(--warning)' : 'var(--ink-faint)' }}>
          {remaining} characters remaining
        </p>
      </div>
      <div className="form-group">
        <label className="label">Urgency</label>
        <select className="input" value={fields.urgency ?? 'Normal'} onChange={e => set('urgency', e.target.value)}>
          {URGENCY_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </>
  );
}

function StrategicReviewForm({ fields, set }: { fields: any; set: (k: string, v: string) => void }) {
  return (
    <>
      <div className="form-group">
        <label className="label">Preferred date 1</label>
        <input type="date" className="input" value={fields.date1 ?? ''} onChange={e => set('date1', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="label">Preferred date 2</label>
        <input type="date" className="input" value={fields.date2 ?? ''} onChange={e => set('date2', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="label">Preferred date 3</label>
        <input type="date" className="input" value={fields.date3 ?? ''} onChange={e => set('date3', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="label">Topics to cover *</label>
        <textarea required rows={4} className="input" value={fields.topics ?? ''} onChange={e => set('topics', e.target.value)} placeholder="What would you like to discuss in the review?" />
      </div>
    </>
  );
}

function HrAuditForm({ fields, set }: { fields: any; set: (k: string, v: string) => void }) {
  return (
    <>
      <div className="form-group">
        <label className="label">Company size</label>
        <select className="input" value={fields.company_size ?? ''} onChange={e => set('company_size', e.target.value)}>
          <option value="">Select…</option>
          {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="label">Current HR setup *</label>
        <textarea required rows={3} className="input" value={fields.hr_setup ?? ''} onChange={e => set('hr_setup', e.target.value)} placeholder="Describe your current HR arrangements…" />
      </div>
      <div className="form-group">
        <label className="label">Main concerns *</label>
        <textarea required rows={3} className="input" value={fields.concerns ?? ''} onChange={e => set('concerns', e.target.value)} placeholder="What are the key areas you'd like audited?" />
      </div>
    </>
  );
}

function SupportQueryForm({ fields, set }: { fields: any; set: (k: string, v: string) => void }) {
  return (
    <>
      <div className="form-group">
        <label className="label">Subject *</label>
        <input required className="input" value={fields.subject ?? ''} onChange={e => set('subject', e.target.value)} placeholder="Brief summary of your query" />
      </div>
      <div className="form-group">
        <label className="label">Full details *</label>
        <textarea required rows={5} className="input" value={fields.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Describe the situation in as much detail as you can." />
      </div>
      <div className="form-group">
        <label className="label">Priority</label>
        <select className="input" value={fields.urgency ?? 'Normal'} onChange={e => set('urgency', e.target.value)}>
          {URGENCY_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </>
  );
}

function ContextualForm({ typeId, fields, set }: {
  typeId: RequestTypeId;
  fields: any;
  set: (k: string, v: string) => void;
}) {
  switch (typeId) {
    case 'policy_update':    return <PolicyUpdateForm    fields={fields} set={set} />;
    case 'salary_benchmark': return <SalaryBenchmarkForm fields={fields} set={set} />;
    case 'manager_support':  return <ManagerSupportForm  fields={fields} set={set} />;
    case 'strategic_review': return <StrategicReviewForm fields={fields} set={set} />;
    case 'hr_audit':         return <HrAuditForm         fields={fields} set={set} />;
    case 'support_query':    return <SupportQueryForm    fields={fields} set={set} />;
  }
}

function subjectFromType(typeId: RequestTypeId, fields: any): string {
  switch (typeId) {
    case 'policy_update':    return `Policy Update: ${fields.policy_name ?? 'Unnamed'}`;
    case 'salary_benchmark': return `Salary Benchmark: ${fields.role_title ?? 'Unnamed role'}`;
    case 'manager_support':  return 'Manager Support Request';
    case 'strategic_review': return 'Strategic Review Booking';
    case 'hr_audit':         return 'HR Audit Request';
    case 'support_query':    return fields.subject ?? 'Support Query';
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewServiceRequestPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [selected, setSelected] = useState<RequestTypeId | null>(null);
  const [fields,   setFields]   = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  function setField(k: string, v: string) {
    setFields(p => ({ ...p, [k]: v }));
  }

  function selectType(id: RequestTypeId) {
    setSelected(id);
    setFields({});
    setError('');
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true); setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated.'); setLoading(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    const companyId = (profile as any)?.company_id;
    const subject   = subjectFromType(selected, fields);
    const urgency   = fields.urgency ?? null;

    const { error: err } = await supabase.from('service_requests').insert({
      company_id:   companyId,
      submitted_by: user.id,
      request_type: selected,
      subject,
      details:      fields as any,
      urgency,
      status:       'new',
    });

    if (err) { setError(err.message); setLoading(false); return; }
    setSuccess(true);
    setLoading(false);
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <>
        <Topbar title="Service Requests" subtitle="Tell us what you need" />
        <main className="portal-page flex-1 max-w-[640px]">
          <div className="card p-12">
            <div className="empty-state">
              <CheckCircle2 size={32} style={{ color: 'var(--teal)' }} />
              <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                Request received
              </p>
              <p className="text-sm max-w-[320px]" style={{ color: 'var(--ink-faint)' }}>
                The People Office will respond within 1 business day.
              </p>
              <a href="/support" className="btn-secondary btn-sm flex items-center gap-1.5 mt-2">
                <ArrowLeft size={13} /> Back to Support
              </a>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ── Main page ───────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar title="Service Requests" subtitle="Tell us what you need" />
      <main className="portal-page flex-1">

        {/* Type selector */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {REQUEST_TYPES.map(rt => {
            const Icon     = rt.icon;
            const isActive = selected === rt.id;
            return (
              <button
                key={rt.id}
                type="button"
                onClick={() => selectType(rt.id)}
                className="card text-left p-5 transition-all hover:shadow-md"
                style={{
                  borderColor: isActive ? rt.color : undefined,
                  borderWidth: isActive ? 2 : undefined,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-3"
                  style={{ background: `${rt.color}18` }}
                >
                  <Icon size={18} style={{ color: rt.color }} />
                </div>
                <p className="font-semibold text-sm leading-snug mb-1" style={{ color: 'var(--ink)' }}>
                  {rt.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  {rt.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Contextual form */}
        {selected && (
          <div className="card p-7 max-w-[640px]">
            <p className="eyebrow mb-5">
              {REQUEST_TYPES.find(r => r.id === selected)?.label}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <ContextualForm typeId={selected} fields={fields} set={setField} />
              {error && (
                <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>
                  {error}
                </p>
              )}
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={loading} className="btn-cta flex items-center gap-2">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Submitting…' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setFields({}); }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Back link */}
        <a
          href="/support"
          className="inline-flex items-center gap-1.5 text-sm mt-6"
          style={{ color: 'var(--ink-faint)' }}
        >
          <ArrowLeft size={13} /> Back to Support
        </a>
      </main>
    </>
  );
}
