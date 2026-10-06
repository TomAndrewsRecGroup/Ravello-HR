'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { readEmployeePrivate } from '@/lib/lead/employeePrivate';
import { renderMergeFields } from '@/lib/documentTemplates/types';
import { resolveMergeFieldValues } from '@/lib/documentTemplates/mergeFieldValues';
import type { DocumentTemplate, MergeFieldDef } from '@/lib/documentTemplates/types';

interface EmployeeRow { id: string; full_name: string | null; [k: string]: unknown }

interface Props {
  template: DocumentTemplate;
  employees: Record<string, unknown>[];
  companyId: string;
  companyName: string;
}

export default function GenerateDocumentClient({ template, employees, companyId, companyName }: Props) {
  const router = useRouter();
  const rows = employees as EmployeeRow[];

  const [employeeId, setEmployeeId] = useState('');
  const [employeeHr, setEmployeeHr] = useState<Record<string, unknown>>({});
  const [hrLoading, setHrLoading] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ title: string } | null>(null);

  const employee = rows.find(r => r.id === employeeId) ?? null;

  useEffect(() => {
    if (!employeeId) { setEmployeeHr({}); return; }
    setHrLoading(true);
    const supabase = createClient();
    readEmployeePrivate(supabase, companyId, [employeeId]).then(priv => {
      const row = priv.get(employeeId);
      setEmployeeHr((row ? { ...row } : {}) as Record<string, unknown>);
      setHrLoading(false);
    });
  }, [employeeId, companyId]);

  const manualFields = template.merge_fields.filter(f => f.source === 'manual');

  const { values, missing } = useMemo(() => resolveMergeFieldValues(template.merge_fields, {
    employeeSafe: (employee ?? {}) as Record<string, unknown>,
    employeeHr,
    companyName,
    manual,
  }), [template.merge_fields, employee, employeeHr, companyName, manual]);

  const rendered = useMemo(() => renderMergeFields(template.body, values), [template.body, values]);

  function labelFor(key: string): string {
    return template.merge_fields.find((f: MergeFieldDef) => f.key === key)?.label ?? key;
  }

  async function save() {
    if (!employee) { setError('Choose an employee first.'); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const title = `${template.title} — ${employee.full_name ?? 'Employee'}`.slice(0, 200);
    const { error: insertError } = await supabase.from('document_instances').insert({
      company_id: companyId,
      template_id: template.id,
      employee_id: employee.id,
      category: template.category,
      rendered_title: title,
      rendered_body: rendered,
      merge_values: values,
      requires_signature: template.requires_signature,
      status: 'draft',
    });
    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    setSaved({ title });
    router.refresh();
  }

  if (saved) {
    return (
      <div className="card p-8 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 size={28} style={{ color: 'var(--teal)' }} />
        <p className="font-medium" style={{ color: 'var(--ink)' }}>Draft saved: {saved.title}</p>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          It can be reviewed and sent for signature from your documents list.
        </p>
        <a href="/lead/document-templates" className="btn-secondary btn-sm mt-2">Back to templates</a>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
      <div className="card p-5 space-y-4">
        <label className="block">
          <span className="label">Employee</span>
          <select className="input" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">Choose an employee…</option>
            {rows.map(r => <option key={r.id} value={r.id}>{r.full_name ?? r.id}</option>)}
          </select>
        </label>

        {hrLoading && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
            <Loader2 size={12} className="animate-spin" /> Loading employee details…
          </p>
        )}

        {manualFields.length > 0 && (
          <div className="space-y-3">
            <p className="label">Fields to fill in</p>
            {manualFields.map((f: MergeFieldDef) => (
              <label key={f.key} className="block">
                <span className="label text-[11px]">{f.label}</span>
                <input
                  className="input"
                  value={manual[f.key] ?? ''}
                  onChange={e => setManual(m => ({ ...m, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}

        {missing.length > 0 && (
          <div className="p-2 rounded text-xs flex items-start gap-2" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Still needs: {missing.map(labelFor).join(', ')}.</span>
          </div>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

        <button className="btn-cta flex items-center gap-1.5" onClick={save} disabled={saving || !employeeId}>
          {saving && <Loader2 size={14} className="animate-spin" />} Save as draft
        </button>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="label">Preview</p>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>
            {preview ? <EyeOff size={13} /> : <Eye size={13} />} {preview ? 'Hide' : 'Show'}
          </button>
        </div>
        {preview && (
          <div className="p-3 rounded text-sm whitespace-pre-wrap max-h-[70vh] overflow-y-auto" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
            {rendered}
          </div>
        )}
      </div>
    </div>
  );
}
