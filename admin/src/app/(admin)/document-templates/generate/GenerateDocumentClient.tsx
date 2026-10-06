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
  /** Each app's own route for the templates list, e.g. '/document-templates' (admin) or '/lead/document-templates' (portal). */
  templatesHref: string;
  /** Each app's own "send this instance" endpoint prefix — the id is appended, e.g. '/api/admin/document-templates' or '/api/lead/document-templates'. */
  sendEndpointBase: string;
}

export default function GenerateDocumentClient({ template, employees, companyId, companyName, templatesHref, sendEndpointBase }: Props) {
  const router = useRouter();
  const rows = employees as EmployeeRow[];

  const [employeeId, setEmployeeId] = useState('');
  const [employeeHr, setEmployeeHr] = useState<Record<string, unknown>>({});
  const [hrLoading, setHrLoading] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ status: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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
    const { data: inserted, error: insertError } = await supabase.from('document_instances').insert({
      company_id: companyId,
      template_id: template.id,
      employee_id: employee.id,
      category: template.category,
      rendered_title: title,
      rendered_body: rendered,
      merge_values: values,
      requires_signature: template.requires_signature,
      status: 'draft',
    }).select('id').single();
    setSaving(false);
    if (insertError || !inserted) { setError(insertError?.message ?? 'Could not save the draft.'); return; }
    setSaved({ id: inserted.id, title });
    router.refresh();
  }

  async function send() {
    if (!saved) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`${sendEndpointBase}/${saved.id}/send`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not send this document.');
      setSendResult({ status: body.status });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send this document.');
    } finally {
      setSending(false);
    }
  }

  if (saved) {
    return (
      <div className="card p-8 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 size={28} style={{ color: 'var(--teal)' }} />
        <p className="font-medium" style={{ color: 'var(--ink)' }}>Draft saved: {saved.title}</p>
        {sendResult ? (
          <p className="text-sm" style={{ color: 'var(--teal)' }}>
            {sendResult.status === 'sent_for_signature'
              ? 'Sent — the employee has been emailed a link to review and sign.'
              : 'Sent — the employee has been emailed this document.'}
          </p>
        ) : (
          <>
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
              {template.requires_signature
                ? 'Send it now for the employee to review and sign, or come back to it later.'
                : 'This document needs no signature — send it now, or come back to it later.'}
            </p>
            {sendError && <p className="text-sm" style={{ color: 'var(--red)' }}>{sendError}</p>}
            <button className="btn-cta btn-sm flex items-center gap-1.5" onClick={send} disabled={sending}>
              {sending && <Loader2 size={13} className="animate-spin" />}
              {template.requires_signature ? 'Send for signature' : 'Send'}
            </button>
          </>
        )}
        <a href={templatesHref} className="btn-secondary btn-sm mt-2">Back to templates</a>
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
