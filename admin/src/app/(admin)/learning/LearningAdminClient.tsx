'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { Plus, X, Loader2, Eye, EyeOff, Star, BookOpen, ExternalLink } from 'lucide-react';

interface LearningContent {
  id: string;
  title: string;
  description: string | null;
  creator_name: string | null;
  category: string | null;
  tags: string[] | null;
  content_type: string;
  file_url: string | null;
  thumbnail_url: string | null;
  duration_mins: number | null;
  price_pence: number;
  stripe_price_id: string | null;
  is_published: boolean;
  is_featured: boolean;
  view_count: number;
  created_at: string;
}

interface Props { initialContent: LearningContent[]; }

const CONTENT_TYPES = ['video', 'pdf', 'pptx', 'link', 'scorm'];
const CATEGORIES = ['HR Fundamentals', 'Leadership', 'Compliance', 'Recruitment', 'Employment Law', 'Wellbeing', 'Management', 'Other'];

function fmtPrice(pence: number): string {
  if (pence === 0) return 'Free';
  return `£${(pence / 100).toFixed(2)}`;
}

export default function LearningAdminClient({ initialContent }: Props) {
  const supabase = createClient();
  const [content, setContent] = useState<LearningContent[]>(initialContent);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState('all');
  const [form, setForm] = useState({
    title: '', description: '', creator_name: '', category: 'HR Fundamentals',
    content_type: 'video', file_url: '', thumbnail_url: '',
    duration_mins: '', price_pence: '0', stripe_price_id: '',
    tags: '', is_featured: false,
  });

  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('learning_content').insert({
      title:           form.title,
      description:     form.description || null,
      creator_name:    form.creator_name || null,
      category:        form.category || null,
      content_type:    form.content_type,
      file_url:        form.file_url || null,
      thumbnail_url:   form.thumbnail_url || null,
      duration_mins:   form.duration_mins ? parseInt(form.duration_mins) : null,
      price_pence:     parseInt(form.price_pence) || 0,
      stripe_price_id: form.stripe_price_id || null,
      tags:            form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
      is_featured:     form.is_featured,
      is_published:    false,
    }).select().single();
    if (!error && data) {
      setContent(prev => [data as LearningContent, ...prev]);
      revalidateAdminPath('/learning');
    }
    setSaving(false);
    setShowForm(false);
    setForm({ title: '', description: '', creator_name: '', category: 'HR Fundamentals', content_type: 'video', file_url: '', thumbnail_url: '', duration_mins: '', price_pence: '0', stripe_price_id: '', tags: '', is_featured: false });
  }

  async function togglePublish(id: string, current: boolean) {
    const { error } = await supabase.from('learning_content').update({ is_published: !current }).eq('id', id);
    if (!error) {
      setContent(prev => prev.map(c => c.id === id ? { ...c, is_published: !current } : c));
      revalidateAdminPath('/learning');
    }
  }

  async function toggleFeatured(id: string, current: boolean) {
    const { error } = await supabase.from('learning_content').update({ is_featured: !current }).eq('id', id);
    if (!error) {
      setContent(prev => prev.map(c => c.id === id ? { ...c, is_featured: !current } : c));
      revalidateAdminPath('/learning');
    }
  }

  const filtered = filterCat === 'all' ? content : content.filter(c => c.category === filterCat);
  const published = content.filter(c => c.is_published).length;
  const totalViews = content.reduce((sum, c) => sum + c.view_count, 0);

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--purple)' }}>{content.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Total Content</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--success)' }}>{published}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Published</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>{totalViews}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Total Views</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select className="input text-xs py-1.5 w-auto" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Content
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Add Learning Content</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Title *</label>
              <input className="input" placeholder="e.g. Employment Rights Bill: What You Need to Know" value={form.title} onChange={e => set('title', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea className="input h-16 resize-none" placeholder="What will learners get from this content?" value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div>
              <label className="label">Creator / Author</label>
              <input className="input" placeholder="e.g. Lucy Andrews" value={form.creator_name} onChange={e => set('creator_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Content Type</label>
              <select className="input" value={form.content_type} onChange={e => set('content_type', e.target.value)}>
                {CONTENT_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Duration (mins)</label>
              <input type="number" className="input" placeholder="45" value={form.duration_mins} onChange={e => set('duration_mins', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">File / Content URL</label>
              <input className="input" placeholder="https://blob.vercel-storage.com/... or YouTube link" value={form.file_url} onChange={e => set('file_url', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Thumbnail URL</label>
              <input className="input" placeholder="https://..." value={form.thumbnail_url} onChange={e => set('thumbnail_url', e.target.value)} />
            </div>
            <div>
              <label className="label">Price (£)</label>
              <input type="number" step="0.01" className="input" placeholder="0 for free" value={form.price_pence === '0' ? '0' : (parseInt(form.price_pence) / 100).toString()} onChange={e => set('price_pence', String(Math.round(parseFloat(e.target.value || '0') * 100)))} />
            </div>
            <div>
              <label className="label">Stripe Price ID</label>
              <input className="input" placeholder="price_..." value={form.stripe_price_id} onChange={e => set('stripe_price_id', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Tags (comma-separated)</label>
              <input className="input" placeholder="e.g. employment law, contracts, 2025" value={form.tags} onChange={e => set('tags', e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="featured" checked={form.is_featured} onChange={e => set('is_featured', e.target.checked)} className="w-4 h-4" />
              <label htmlFor="featured" className="text-sm" style={{ color: 'var(--ink-soft)' }}>Feature on homepage</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.title.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save as Draft
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Content table */}
      {filtered.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state py-4">
            <BookOpen size={24} />
            <p className="text-sm">No content yet</p>
            <p className="text-xs max-w-[280px]">Add learning content to populate the client marketplace.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {['Title', 'Category', 'Type', 'Duration', 'Price', 'Views', 'Status', ''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      {c.is_featured && <Star size={12} style={{ color: 'var(--warning)' }} />}
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{c.title}</p>
                        {c.creator_name && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{c.creator_name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="text-sm">{c.category ?? '—'}</td>
                  <td className="text-sm uppercase">{c.content_type}</td>
                  <td className="text-sm">{c.duration_mins ? `${c.duration_mins}m` : '—'}</td>
                  <td className="text-sm font-semibold">{fmtPrice(c.price_pence)}</td>
                  <td className="text-sm">{c.view_count}</td>
                  <td>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: c.is_published ? 'rgba(22,163,74,0.12)' : 'rgba(148,163,184,0.12)',
                        color: c.is_published ? '#166534' : '#475569',
                      }}
                    >
                      {c.is_published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => togglePublish(c.id, c.is_published)}
                        className="btn-ghost btn-sm flex items-center gap-1"
                        title={c.is_published ? 'Unpublish' : 'Publish'}
                      >
                        {c.is_published ? <EyeOff size={12} /> : <Eye size={12} />}
                        {c.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        onClick={() => toggleFeatured(c.id, c.is_featured)}
                        className="btn-ghost btn-sm"
                        title={c.is_featured ? 'Remove from featured' : 'Feature'}
                      >
                        <Star size={12} style={{ color: c.is_featured ? '#F59E0B' : 'var(--ink-faint)' }} />
                      </button>
                      {c.file_url && (
                        <a href={c.file_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
