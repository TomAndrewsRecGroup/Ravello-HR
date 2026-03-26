'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Trash2, Edit2, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Template {
  id: string;
  title: string;
  department: string | null;
  seniority: string | null;
  working_model: string | null;
  description: string | null;
  must_haves: string[] | null;
  benefits: string[] | null;
  tags: string[] | null;
  created_at: string;
}

interface Props { initialTemplates: Template[] }

const DEPARTMENTS = ['Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Finance', 'HR', 'Operations', 'Legal', 'Other'];
const SENIORITY   = ['Junior', 'Mid', 'Senior', 'Lead', 'Principal', 'Manager', 'Director', 'VP', 'C-Suite'];
const MODELS      = ['remote', 'hybrid', 'office'];

const empty = {
  title: '', department: 'Engineering', seniority: 'Mid', working_model: 'hybrid',
  description: '', must_haves: '', benefits: '', tags: '',
};

export default function TemplatesClient({ initialTemplates }: Props) {
  const supabase = useRouter ? createClient() : createClient();
  const router   = useRouter();
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [form, setForm]           = useState(empty);
  const [search, setSearch]       = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function openNew() { setForm(empty); setEditing(null); setShowForm(true); }
  function openEdit(t: Template) {
    setForm({
      title:         t.title,
      department:    t.department ?? 'Engineering',
      seniority:     t.seniority  ?? 'Mid',
      working_model: t.working_model ?? 'hybrid',
      description:   t.description ?? '',
      must_haves:    (t.must_haves ?? []).join('\n'),
      benefits:      (t.benefits ?? []).join('\n'),
      tags:          (t.tags ?? []).join(', '),
    });
    setEditing(t.id);
    setShowForm(true);
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title:         form.title.trim(),
      department:    form.department || null,
      seniority:     form.seniority  || null,
      working_model: form.working_model || null,
      description:   form.description.trim() || null,
      must_haves:    form.must_haves.split('\n').map(s => s.trim()).filter(Boolean),
      benefits:      form.benefits.split('\n').map(s => s.trim()).filter(Boolean),
      tags:          form.tags.split(',').map(s => s.trim()).filter(Boolean),
    };
    if (editing) {
      const { data } = await supabase.from('jd_templates').update(payload).eq('id', editing).select().single();
      if (data) setTemplates(ts => ts.map(t => t.id === editing ? (data as Template) : t));
    } else {
      const { data } = await supabase.from('jd_templates').insert(payload).select().single();
      if (data) setTemplates(ts => [data as Template, ...ts]);
    }
    setSaving(false);
    setShowForm(false);
    setEditing(null);
  }

  async function del(id: string) {
    setDeleting(id);
    await supabase.from('jd_templates').delete().eq('id', id);
    setTemplates(ts => ts.filter(t => t.id !== id));
    setDeleting(null);
  }

  const filtered = templates.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6">
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

      {/* Form */}
      {showForm && (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              {editing ? 'Edit Template' : 'New JD Template'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditing(null); }}>
              <X size={16} style={{ color: 'var(--ink-faint)' }} />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Senior Software Engineer" />
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" value={form.department} onChange={e => set('department', e.target.value)}>
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Seniority</label>
              <select className="input" value={form.seniority} onChange={e => set('seniority', e.target.value)}>
                {SENIORITY.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Working Model</label>
              <select className="input" value={form.working_model} onChange={e => set('working_model', e.target.value)}>
                {MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tags (comma-separated)</label>
              <input className="input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="e.g. typescript, react, fintech" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Role Description</label>
              <textarea className="input" rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the role and team context…" />
            </div>
            <div>
              <label className="label">Must-haves (one per line)</label>
              <textarea className="input" rows={5} value={form.must_haves} onChange={e => set('must_haves', e.target.value)} placeholder="5+ years of experience in…&#10;Strong knowledge of…" />
            </div>
            <div>
              <label className="label">Benefits (one per line)</label>
              <textarea className="input" rows={5} value={form.benefits} onChange={e => set('benefits', e.target.value)} placeholder="25 days holiday&#10;Remote-first&#10;Private healthcare" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
            <button className="btn-cta btn-sm flex items-center gap-1.5" onClick={save} disabled={saving}>
              {saving && <Loader2 size={13} className="animate-spin" />}
              {editing ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </div>
      )}

      {/* Templates grid */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16">
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            {search ? 'No templates match your search.' : 'No JD templates yet. Create one to speed up role creation.'}
          </p>
          {!search && <button className="btn-cta btn-sm" onClick={openNew}>Create first template</button>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <div
              key={t.id}
              className="card p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow"
            >
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{t.title}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {t.department && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>{t.department}</span>
                  )}
                  {t.seniority && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>{t.seniority}</span>
                  )}
                  {t.working_model && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--teal)' }}>{t.working_model}</span>
                  )}
                </div>
              </div>

              {t.must_haves && t.must_haves.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-faint)' }}>Must-haves</p>
                  <ul className="space-y-0.5">
                    {t.must_haves.slice(0, 3).map((m, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        <span className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5" style={{ background: 'var(--purple)' }} />
                        {m}
                      </li>
                    ))}
                    {t.must_haves.length > 3 && (
                      <li className="text-xs" style={{ color: 'var(--ink-faint)' }}>+{t.must_haves.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                <a
                  href={`/hiring/new?template=${t.id}`}
                  className="btn-cta btn-sm flex items-center gap-1.5 flex-1 justify-center"
                >
                  Use Template <ArrowRight size={12} />
                </a>
                <button
                  className="btn-icon btn-sm"
                  onClick={() => openEdit(t)}
                  title="Edit"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  className="btn-icon btn-sm"
                  onClick={() => del(t.id)}
                  disabled={deleting === t.id}
                  title="Delete"
                  style={{ color: 'var(--red)' }}
                >
                  {deleting === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
