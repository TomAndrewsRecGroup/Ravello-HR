'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Gauge, ChevronRight, ChevronLeft, Loader2, AlertTriangle,
  CheckCircle2, ArrowRight, BarChart3,
} from 'lucide-react';
import type { CompanyAssessment, AssessmentDimension } from '@/lib/supabase/types';

/* ─── Band colours ────────────────────────────────── */
function bandStyle(band: string | null): React.CSSProperties {
  switch (band) {
    case 'Low Friction':      return { background: 'rgba(52,211,153,0.14)', color: '#047857' };
    case 'Moderate Friction':  return { background: 'rgba(245,158,11,0.15)', color: '#8A5500' };
    case 'High Friction':      return { background: 'rgba(217,68,68,0.10)',  color: '#B02020' };
    default:                   return { background: 'rgba(7,11,29,0.07)',    color: '#38436A' };
  }
}

function severityStyle(sev: string): React.CSSProperties {
  switch (sev) {
    case 'critical': return { background: 'rgba(217,68,68,0.10)',  color: '#B02020' };
    case 'high':     return { background: 'rgba(245,130,11,0.12)', color: '#A45500' };
    case 'medium':   return { background: 'rgba(245,158,11,0.10)', color: '#8A5500' };
    case 'low':      return { background: 'rgba(59,111,255,0.10)', color: '#2A55CC' };
    default:         return { background: 'rgba(7,11,29,0.07)',    color: '#38436A' };
  }
}

/* ─── Form field renderer ─────────────────────────── */
interface FormField {
  key: string;
  description: string;
  type: string;
  values_hint?: string[];
  applicable_bands: Record<string, boolean>;
}

interface FormDimension {
  name: string;
  key: string;
  fields: FormField[];
}

interface FormSchema {
  dimensions: FormDimension[];
  employee_bands: Record<string, { min: number; max: number }>;
  field_types: Record<string, { values?: string[] }>;
}

function FieldInput({
  field, value, onChange, fieldTypes,
}: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
  fieldTypes: Record<string, { values?: string[] }>;
}) {
  const type = field.type;
  const typeInfo = fieldTypes[type];

  if (type === 'boolean') {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`toggle ${value ? 'toggle-on' : 'toggle-off'}`}
        >
          <div className={`toggle-knob ${value ? 'toggle-knob-on' : 'toggle-knob-off'}`} />
        </button>
        <span className="text-sm" style={{ color: value ? '#047857' : 'var(--ink-faint)' }}>
          {value ? 'Yes' : 'No'}
        </span>
      </div>
    );
  }

  if (type === 'integer') {
    return (
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        className="input w-32"
      />
    );
  }

  // three_way, work_model, or any enum type
  const values = field.values_hint ?? typeInfo?.values ?? [];
  if (values.length > 0) {
    return (
      <div className="flex flex-wrap gap-2">
        {values.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: value === v ? 'var(--purple)' : 'var(--surface-alt)',
              color: value === v ? '#fff' : 'var(--ink-soft)',
            }}
          >
            {v.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
    );
  }

  // Fallback text input
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="input"
    />
  );
}

/* ─── Main page ───────────────────────────────────── */
export default function FrictionLensPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [loading,    setLoading]    = useState(true);
  const [assessment, setAssessment] = useState<CompanyAssessment | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [schema,     setSchema]     = useState<FormSchema | null>(null);
  const [schemaErr,  setSchemaErr]  = useState('');

  // Form state
  const [step,           setStep]           = useState(0); // 0 = employee count, 1-10 = dimensions
  const [employeeCount,  setEmployeeCount]  = useState<number>(0);
  const [formData,       setFormData]       = useState<Record<string, any>>({});
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState('');

  // Derived
  const employeeBand = employeeCount <= 10 ? 'micro' : employeeCount <= 50 ? 'small' : employeeCount <= 250 ? 'mid' : 'large';

  // Load existing assessment
  useEffect(() => {
    fetch('/api/company/results')
      .then(r => r.json())
      .then(d => { if (d.assessment) setAssessment(d.assessment); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load form schema when entering form mode
  useEffect(() => {
    if (!showForm || schema) return;
    fetch('/api/company/form-schema')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load form schema');
        return r.json();
      })
      .then(d => setSchema(d))
      .catch(e => setSchemaErr(e.message));
  }, [showForm]);

  function setField(dimKey: string, fieldKey: string, value: any) {
    setFormData(prev => ({
      ...prev,
      [dimKey]: { ...(prev[dimKey] ?? {}), [fieldKey]: value },
    }));
  }

  function visibleFields(dim: FormDimension): FormField[] {
    return dim.fields.filter(f => f.applicable_bands[employeeBand] !== false);
  }

  async function handleSubmit() {
    setSubmitting(true); setSubmitError('');
    try {
      // Get company info for registration
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
      if (!profile?.company_id) throw new Error('No company');

      const { data: company } = await supabase.from('companies').select('name, sector, contact_email, ivylens_company_id').eq('id', profile.company_id).single();

      let ivylensCompanyId = company?.ivylens_company_id;

      // Register with IvyLens if not already registered
      if (!ivylensCompanyId) {
        const regRes = await fetch('/api/company/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: company?.name ?? 'Unknown',
            industry: company?.sector ?? '',
            country: 'UK',
            employee_count: employeeCount,
            contact_email: company?.contact_email ?? '',
          }),
        });
        if (!regRes.ok) throw new Error('Failed to register company');
        const regData = await regRes.json();
        ivylensCompanyId = regData.company_id;
      }

      // Flatten form data into IvyLens format
      const flatResponses: Record<string, any> = { employee_count: employeeCount };
      for (const [dimKey, fields] of Object.entries(formData)) {
        flatResponses[dimKey] = fields;
      }

      // Submit assessment
      const res = await fetch('/api/company/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: ivylensCompanyId,
          employee_count: employeeCount,
          form_responses: flatResponses,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Assessment failed');
      }

      const data = await res.json();
      setAssessment(data.assessment);
      setShowForm(false);
      router.refresh();
    } catch (err: any) {
      setSubmitError(err.message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading ───────────────────────────────────────
  if (loading) {
    return (
        <main className="portal-page flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--purple)' }} />
        </main>
    );
  }

  // ─── Assessment Form ───────────────────────────────
  if (showForm) {
    const dims = schema?.dimensions ?? [];
    const totalSteps = dims.length + 1; // step 0 = employee count

    return (
        <main className="portal-page flex-1 max-w-[720px]">

          {schemaErr && (
            <div className="card p-4 mb-4 flex items-center gap-2" style={{ background: 'rgba(217,68,68,0.06)' }}>
              <AlertTriangle size={14} style={{ color: 'var(--red)' }} />
              <p className="text-sm" style={{ color: 'var(--red)' }}>{schemaErr}</p>
            </div>
          )}

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full mb-6" style={{ background: 'var(--surface-alt)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / totalSteps) * 100}%`, background: 'var(--gradient)' }}
            />
          </div>

          {/* Step 0: Employee count */}
          {step === 0 && (
            <div className="card p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>How many employees does your company have?</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>
                  This determines which questions are relevant to your size. Smaller companies skip questions that don't apply.
                </p>
              </div>
              <input
                type="number"
                min={1}
                value={employeeCount || ''}
                onChange={e => setEmployeeCount(Number(e.target.value))}
                className="input text-lg w-48"
                placeholder="e.g. 25"
              />
              {employeeCount > 0 && (
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                  Size band: <span className="font-semibold capitalize">{employeeBand}</span>
                  {employeeBand === 'micro' && ' — 25 fields will be skipped'}
                  {employeeBand === 'small' && ' — 9 fields will be skipped'}
                  {employeeBand === 'mid' && ' — 1 field will be skipped'}
                  {employeeBand === 'large' && ' — all fields shown'}
                </p>
              )}
              <button
                onClick={() => setStep(1)}
                disabled={!employeeCount || employeeCount < 1}
                className="btn-cta flex items-center gap-2"
              >
                Continue <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Steps 1–N: Dimension fields */}
          {step > 0 && schema && dims[step - 1] && (() => {
            const dim = dims[step - 1];
            const fields = visibleFields(dim);
            return (
              <div className="card p-6 space-y-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1" style={{ color: 'var(--purple)' }}>
                    Section {step} of {dims.length}
                  </p>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>{dim.name}</h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                    {fields.length} question{fields.length !== 1 ? 's' : ''} for your size
                  </p>
                </div>

                <div className="space-y-5">
                  {fields.map(field => (
                    <div key={field.key} className="space-y-2">
                      <label className="label">{field.description}</label>
                      <FieldInput
                        field={field}
                        value={formData[dim.key]?.[field.key]}
                        onChange={v => setField(dim.key, field.key, v)}
                        fieldTypes={schema.field_types ?? {}}
                      />
                    </div>
                  ))}
                </div>

                {submitError && step === dims.length && (
                  <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{submitError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex items-center gap-1.5">
                    <ChevronLeft size={14} /> Back
                  </button>
                  {step < dims.length ? (
                    <button onClick={() => setStep(s => s + 1)} className="btn-cta flex items-center gap-2">
                      Continue <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="btn-cta flex items-center gap-2 flex-1 justify-center"
                    >
                      {submitting ? <><Loader2 size={14} className="animate-spin" /> Scoring…</> : <>Submit Assessment <ArrowRight size={14} /></>}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </main>
    );
  }

  // ─── Results View ──────────────────────────────────
  if (assessment) {
    const dims = (assessment.dimensions ?? []) as AssessmentDimension[];
    return (
        <main className="portal-page flex-1 max-w-[960px] space-y-6">

          {/* Hero band card */}
          <div
            className="card p-8 text-center"
            style={{ background: assessment.overall_band === 'Low Friction' ? 'rgba(52,211,153,0.06)' : assessment.overall_band === 'High Friction' ? 'rgba(217,68,68,0.04)' : 'rgba(245,158,11,0.04)' }}
          >
            <Gauge size={40} style={{ color: 'var(--purple)', margin: '0 auto 12px' }} />
            <span className="badge text-base px-4 py-1.5 font-semibold" style={bandStyle(assessment.overall_band)}>
              {assessment.overall_band ?? 'Not Scored'}
            </span>
            {assessment.summary && (
              <p className="text-sm mt-3 max-w-md mx-auto" style={{ color: 'var(--ink-soft)' }}>{assessment.summary}</p>
            )}
            <div className="flex justify-center gap-6 mt-4 text-xs" style={{ color: 'var(--ink-faint)' }}>
              {assessment.confidence && <span>Confidence: <strong className="capitalize">{assessment.confidence}</strong></span>}
              <span>Employees: <strong>{assessment.employee_count}</strong></span>
              <span>Assessed: <strong>{new Date(assessment.created_at).toLocaleDateString()}</strong></span>
            </div>
          </div>

          {/* Top signals */}
          {assessment.top_signals?.length > 0 && (
            <div className="card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>
                Top Friction Signals
              </p>
              <div className="space-y-2">
                {assessment.top_signals.map((sig, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--gold)' }} />
                    <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{sig}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dimension grid */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--ink-faint)' }}>
              Dimension Breakdown
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {dims.map((dim, i) => (
                <DimensionCard key={i} dim={dim} />
              ))}
            </div>
          </div>

          {/* Retake */}
          <div className="flex justify-center pt-2 pb-4">
            <button onClick={() => { setShowForm(true); setStep(0); setFormData({}); }} className="btn-secondary flex items-center gap-2">
              <Gauge size={14} /> Retake Assessment
            </button>
          </div>
        </main>
    );
  }

  // ─── No Assessment — Landing ───────────────────────
  return (
      <main className="portal-page flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(124,58,237,0.08)' }}
          >
            <Gauge size={32} style={{ color: 'var(--purple)' }} />
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>
            Get your Company Friction Score
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
            Answer questions across 10 dimensions of your HR operations — hiring, onboarding, compensation, policies, and more.
            You'll get a friction score, actionable signals, and industry benchmarks.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-cta flex items-center gap-2 mx-auto">
            <Gauge size={14} /> Start Assessment
          </button>
        </div>
      </main>
  );
}

/* ─── Dimension Card ──────────────────────────────── */
function DimensionCard({ dim }: { dim: AssessmentDimension }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{dim.name}</p>
        <span className="badge text-xs" style={bandStyle(dim.band)}>{dim.band}</span>
      </div>

      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--ink-faint)' }}>
        <span>{dim.fields_answered}/{dim.fields_total} answered</span>
        {dim.signal_count > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle size={10} /> {dim.signal_count} signal{dim.signal_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {dim.signals.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--purple)' }}
          >
            {expanded ? 'Hide signals' : 'View signals'}
          </button>
          {expanded && (
            <div className="space-y-2 pt-1">
              {dim.signals.map((sig, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="badge text-[10px] mt-0.5 flex-shrink-0" style={severityStyle(sig.severity)}>
                    {sig.severity}
                  </span>
                  <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{sig.detail}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
