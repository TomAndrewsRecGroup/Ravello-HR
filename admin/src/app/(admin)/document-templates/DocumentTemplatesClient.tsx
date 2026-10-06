'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, X, Trash2, Edit2, Loader2, FileText, RefreshCw, Archive,
  Eye, EyeOff, AlertTriangle, Sparkles, FileSignature,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { useToast } from '@/components/modules/Toast';
import { DOC_CATEGORIES, DOC_CATEGORY_LABELS, type DocCategory } from '@/lib/ui/statusMaps';
import {
  DOCUMENT_TEMPLATE_STATUS_LABELS,
  renderMergeFields,
  extractMergeFieldKeys,
  type DocumentTemplate,
  type DocumentTemplateStatus,
  type MergeFieldDef,
  type MergeFieldSource,
} from '@/lib/documentTemplates/types';

interface Props { initialTemplates: DocumentTemplate[] }

const PATH = '/document-templates';

const MERGE_SOURCE_LABELS: Record<MergeFieldSource, string> = {
  employee: 'From employee record',
  company:  'From company record',
  date:     'Today’s date',
  manual:   'Typed when generating',
};

const emptyForm = {
  title: '',
  category: 'contract' as DocCategory,
  description: '',
  body: '',
  requires_signature: true,
  is_example: false,
  status: 'active' as DocumentTemplateStatus,
};

export default function DocumentTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>(initialTemplates);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [supersedesOf, setSupersedesOf] = useState<DocumentTemplate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [mergeFields, setMergeFields] = useState<MergeFieldDef[]>([]);
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  function set<K extends keyof typeof emptyForm>(k: K, v: typeof emptyForm[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function openNew() {
    setForm(emptyForm);
    setMergeFields([]);
    setEditing(null);
    setSupersedesOf(null);
    setShowForm(true);
  }

  function openEdit(t: DocumentTemplate) {
    setForm({
      title: t.title,
      category: t.category as DocCategory,
      description: t.description ?? '',
      body: t.body,
      requires_signature: t.requires_signature,
      is_example: t.is_example,
      status: t.status,
    });
    setMergeFields(t.merge_fields);
    setEditing(t.id);
    setSupersedesOf(null);
    setShowForm(true);
  }

  function openNewVersion(t: DocumentTemplate) {
    setForm({
      title: t.title,
      category: t.category as DocCategory,
      description: t.description ?? '',
      body: t.body,
      requires_signature: t.requires_signature,
      is_example: t.is_example,
      status: 'draft',
    });
    setMergeFields(t.merge_fields);
    setEditing(null);
    setSupersedesOf(t);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setSupersedesOf(null);
  }

  const bodyKeys = extractMergeFieldKeys(form.body);
  const declaredKeys = mergeFields.map(f => f.key);
  const undeclared = bodyKeys.filter(k => !declaredKeys.includes(k));
  const unused = declaredKeys.filter(k => !bodyKeys.includes(k));

  const active = templates.filter(t => t.status === 'active');
  const drafts = templates.filter(t => t.status === 'draft');
  const history = templates.filter(t => t.status === 'superseded' || t.status === 'archived');

  const filtered = (list: DocumentTemplate[]) => list.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase()),
  );

  function patchLocal(updated: DocumentTemplate) {
    setTemplates(ts => {
      const idx = ts.findIndex(t => t.id === updated.id);
      if (idx === -1) return [updated, ...ts];
      const next = [...ts];
      next[idx] = updated;
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <input
          className="input h-9 text-sm max-w-[280px]"
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn-cta btn-sm flex items-center gap-1.5 ml-auto" onClick={openNew}>
          <Plus size={14} /> New Template
        </button>
      </div>

      {showForm && (
        <TemplateForm
          form={form}
          set={set}
          mergeFields={mergeFields}
          setMergeFields={setMergeFields}
          editing={editing}
          supersedesOf={supersedesOf}
          undeclared={undeclared}
          unused={unused}
          onCancel={closeForm}
          onSaved={(saved) => { patchLocal(saved); closeForm(); }}
        />
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Drafts</p>
          <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
            {filtered(drafts).map(t => (
              <TemplateRow key={t.id} t={t} onEdit={() => openEdit(t)} onNewVersion={null}
                onChange={patchLocal} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Active templates</p>
        {filtered(active).length === 0 ? (
          <div className="card empty-state p-10">
            <FileText size={28} style={{ color: 'var(--ink-faint)' }} />
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
              {search ? 'No templates match your search.' : 'No active templates yet.'}
            </p>
          </div>
        ) : (
          <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
            {filtered(active).map(t => (
              <TemplateRow key={t.id} t={t} onEdit={null} onNewVersion={() => openNewVersion(t)}
                onChange={patchLocal} />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <button
            type="button"
            className="text-sm font-medium"
            style={{ color: 'var(--ink-soft)' }}
            onClick={() => setShowHistory(h => !h)}
          >
            {showHistory ? 'Hide' : 'Show'} {history.length} superseded / archived version{history.length === 1 ? '' : 's'}
          </button>
          {showHistory && (
            <ul className="card divide-y mt-2" style={{ borderColor: 'var(--line)' }}>
              {filtered(history).map(t => (
                <li key={t.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                  <span style={{ color: 'var(--ink-faint)' }}>
                    {t.title} · <strong>{DOCUMENT_TEMPLATE_STATUS_LABELS[t.status]}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function TemplateRow({ t, onEdit, onNewVersion, onChange }: {
  t: DocumentTemplate;
  onEdit: (() => void) | null;
  onNewVersion: (() => void) | null;
  onChange: (updated: DocumentTemplate) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  async function transition(to: DocumentTemplateStatus) {
    setBusy(to);
    const supabase = createClient();
    // .select().single() errors outright on zero matched rows (RLS
    // refusal or a deleted id) — the same certainty COUNT_EXACT gives
    // an update with no row back, satisfied here by asking for the row.
    const { data, error } = await supabase.from('document_templates').update({ status: to }).eq('id', t.id).select().single();
    setBusy(null);
    if (error || !data) { toast(error?.message ?? 'This template was not saved — the update matched no rows.', 'error'); return; }
    onChange(data as DocumentTemplate);
    revalidateAdminPath(PATH);
    toast('Updated', 'success');
    router.refresh();
  }

  return (
    <li className="p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <FileText size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0, marginTop: 2 }} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-medium flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            {t.title}
            {t.is_example && (
              <span className="text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(191,143,40,0.12)', color: 'var(--gold)' }}>
                <Sparkles size={10} /> Example — review before real use
              </span>
            )}
          </p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            {DOC_CATEGORY_LABELS[t.category as DocCategory] ?? t.category} · {DOCUMENT_TEMPLATE_STATUS_LABELS[t.status]}
            {t.requires_signature ? ' · requires signature' : ' · no signature required'}
          </p>
          {t.description && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{t.description}</p>}
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <button className="btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>
            {preview ? <EyeOff size={13} /> : <Eye size={13} />} {preview ? 'Hide' : 'Preview'}
          </button>
          {onEdit && (
            <button className="btn-icon btn-sm" onClick={onEdit} title="Edit" aria-label="Edit">
              <Edit2 size={13} />
            </button>
          )}
          {t.status === 'active' && (
            <Link prefetch={false} href={`/document-templates/generate?template=${t.id}`} className="btn-cta btn-sm flex items-center gap-1.5">
              <FileSignature size={13} /> Generate
            </Link>
          )}
          {onNewVersion && (
            <button className="btn-secondary btn-sm" onClick={onNewVersion}>
              <RefreshCw size={13} /> New version
            </button>
          )}
          {t.status === 'draft' && (
            <button className="btn-cta btn-sm" disabled={busy !== null} onClick={() => transition('active')}>
              {busy === 'active' ? <Loader2 size={12} className="animate-spin" /> : null} Publish
            </button>
          )}
          {(t.status === 'draft' || t.status === 'active' || t.status === 'superseded') && (
            <button className="btn-icon btn-sm" disabled={busy !== null} onClick={() => transition('archived')} title="Archive" aria-label="Archive" style={{ color: 'var(--red)' }}>
              {busy === 'archived' ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
            </button>
          )}
        </div>
      </div>
      {preview && (
        <div className="p-3 rounded text-sm whitespace-pre-wrap" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
          {renderMergeFields(t.body, {})}
        </div>
      )}
    </li>
  );
}

function MergeFieldsEditor({ mergeFields, setMergeFields }: {
  mergeFields: MergeFieldDef[];
  setMergeFields: (fn: (fs: MergeFieldDef[]) => MergeFieldDef[]) => void;
}) {
  function addField() {
    setMergeFields(fs => [...fs, { key: '', label: '', source: 'manual' }]);
  }
  function updateField(i: number, patch: Partial<MergeFieldDef>) {
    setMergeFields(fs => fs.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }
  function removeField(i: number) {
    setMergeFields(fs => fs.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {mergeFields.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
          <label className="block">
            {i === 0 && <span className="label text-[11px]">Key</span>}
            <input className="input h-8 text-xs" value={f.key} placeholder="employee_name"
              onChange={e => updateField(i, { key: e.target.value.trim() })} />
          </label>
          <label className="block">
            {i === 0 && <span className="label text-[11px]">Label</span>}
            <input className="input h-8 text-xs" value={f.label} placeholder="Employee name"
              onChange={e => updateField(i, { label: e.target.value })} />
          </label>
          <label className="block">
            {i === 0 && <span className="label text-[11px]">Filled from</span>}
            <select className="input h-8 text-xs" value={f.source}
              onChange={e => updateField(i, { source: e.target.value as MergeFieldSource })}>
              {Object.entries(MERGE_SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            {i === 0 && <span className="label text-[11px]">Employee column</span>}
            <input
              className="input h-8 text-xs"
              disabled={f.source !== 'employee'}
              value={f.employee_column ?? ''}
              placeholder={f.source === 'employee' ? 'job_title' : '—'}
              onChange={e => updateField(i, { employee_column: e.target.value.trim() || undefined })}
            />
          </label>
          <button type="button" className="btn-icon btn-sm" onClick={() => removeField(i)} title="Remove field" aria-label="Remove field" style={{ color: 'var(--red)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={addField}>
        <Plus size={13} /> Add merge field
      </button>
    </div>
  );
}

function TemplateForm({ form, set, mergeFields, setMergeFields, editing, supersedesOf, undeclared, unused, onCancel, onSaved }: {
  form: typeof emptyForm;
  set: <K extends keyof typeof emptyForm>(k: K, v: typeof emptyForm[K]) => void;
  mergeFields: MergeFieldDef[];
  setMergeFields: (fn: (fs: MergeFieldDef[]) => MergeFieldDef[]) => void;
  editing: string | null;
  supersedesOf: DocumentTemplate | null;
  undeclared: string[];
  unused: string[];
  onCancel: () => void;
  onSaved: (saved: DocumentTemplate) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  async function save() {
    if (!form.title.trim() || !form.body.trim()) { toast('Title and body are required.', 'error'); return; }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      title: form.title.trim(),
      category: form.category,
      description: form.description.trim() || null,
      body: form.body,
      merge_fields: mergeFields.filter(f => f.key.trim()),
      requires_signature: form.requires_signature,
      is_example: form.is_example,
      status: form.status,
    };

    if (editing) {
      const { data, error } = await supabase.from('document_templates').update(payload).eq('id', editing).select().single();
      setSaving(false);
      if (error || !data) { toast(error?.message ?? 'Could not save the template.', 'error'); return; }
      toast('Template updated', 'success');
      onSaved(data as DocumentTemplate);
      return;
    }

    const { data, error } = await supabase.from('document_templates').insert({
      ...payload,
      supersedes_id: supersedesOf?.id ?? null,
    }).select().single();
    setSaving(false);
    if (error || !data) { toast(error?.message ?? 'Could not save the template.', 'error'); return; }
    toast(supersedesOf ? 'New version created' : 'Template created', 'success');
    onSaved(data as DocumentTemplate);
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          {supersedesOf ? `New version of “${supersedesOf.title}”` : editing ? 'Edit Template' : 'New Template'}
        </h3>
        <button onClick={onCancel}><X size={16} style={{ color: 'var(--ink-faint)' }} /></button>
      </div>

      {supersedesOf && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          The current active version stays in use until this new one is published.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="label">Title *</span>
          <input className="input" maxLength={200} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Standard Employment Contract" />
        </label>
        <label className="block">
          <span className="label">Category</span>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value as DocCategory)}>
            {DOC_CATEGORIES.map(c => <option key={c} value={c}>{DOC_CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value as DocumentTemplateStatus)}>
            <option value="draft">Draft (work on it before publishing)</option>
            <option value="active">Active (clients can generate from it now)</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Description (optional, staff-only context)</span>
          <input className="input" maxLength={1000} value={form.description} onChange={e => set('description', e.target.value)} placeholder="When to use this template" />
        </label>
        <div className="sm:col-span-2 flex items-center gap-5">
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <input type="checkbox" checked={form.requires_signature} onChange={e => set('requires_signature', e.target.checked)} />
            Requires signature
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <input type="checkbox" checked={form.is_example} onChange={e => set('is_example', e.target.checked)} />
            Flag as a starter example (must be reviewed before real use)
          </label>
        </div>

        <label className="block sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="label">Body — use <code>{'{{merge_field}}'}</code> placeholders</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>
              {preview ? <EyeOff size={13} /> : <Eye size={13} />} {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="input min-h-[220px] whitespace-pre-wrap text-sm" style={{ background: 'var(--surface-alt)' }}>
              {renderMergeFields(form.body, {})}
            </div>
          ) : (
            <textarea className="input font-mono text-xs" rows={12} maxLength={50000} value={form.body}
              onChange={e => set('body', e.target.value)}
              placeholder={'Dear {{employee_name}},\n\nThis letter confirms your appointment as {{job_title}}…'} />
          )}
        </label>

        {(undeclared.length > 0 || unused.length > 0) && (
          <div className="sm:col-span-2 p-2 rounded text-xs flex items-start gap-2" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {undeclared.length > 0 && <>Used in the body but not declared as a merge field: {undeclared.join(', ')}. </>}
              {unused.length > 0 && <>Declared but never used in the body: {unused.join(', ')}.</>}
            </span>
          </div>
        )}

        <div className="sm:col-span-2">
          <span className="label">Merge fields</span>
          <MergeFieldsEditor mergeFields={mergeFields} setMergeFields={setMergeFields} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn-cta btn-sm flex items-center gap-1.5" onClick={save} disabled={saving}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          {supersedesOf ? 'Create new version' : editing ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
    </div>
  );
}
