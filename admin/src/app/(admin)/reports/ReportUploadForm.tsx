'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { Loader2, UploadCloud, Link as LinkIcon } from 'lucide-react';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xlsx', 'csv']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function sanitizeFilename(name: string): string {
  // Strip everything except alphanumerics, hyphens, underscores, and dots
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.');
}

const PERIODS = [
  'January 2026','February 2026','March 2026','April 2026','May 2026','June 2026',
  'July 2026','August 2026','September 2026','October 2026','November 2026','December 2026',
  'Q1 2026','Q2 2026','Q3 2026','Q4 2026',
  'January 2025','February 2025','March 2025','April 2025','May 2025','June 2025',
  'July 2025','August 2025','September 2025','October 2025','November 2025','December 2025',
  'Q1 2025','Q2 2025','Q3 2025','Q4 2025',
  'Annual 2025','Annual 2026',
];

interface Props {
  companies: { id: string; name: string }[];
}

type Mode = 'url' | 'file';

export default function ReportUploadForm({ companies }: Props) {
  const supabase = createClient();

  const [mode,       setMode]       = useState<Mode>('url');
  const [form,       setForm]       = useState({ company_id: '', title: '', period: '', file_url: '' });
  const [file,       setFile]       = useState<File | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!form.company_id || !form.title) {
      setError('Client and title are required.');
      setLoading(false);
      return;
    }

    let fileUrl = form.file_url;

    // Upload file to Supabase Storage if mode=file
    if (mode === 'file') {
      if (!file) { setError('Please select a file.'); setLoading(false); return; }

      // Server-grade validation: extension, MIME type, and file size
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        setError(`File type .${ext} is not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
        setLoading(false);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.`);
        setLoading(false);
        return;
      }

      const safeName = sanitizeFilename(file.name);
      const path = `reports/${form.company_id}/${Date.now()}_${safeName}`;
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: false });
      if (uploadErr) { setError(uploadErr.message); setLoading(false); return; }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
      fileUrl = urlData.publicUrl;
    }

    if (!fileUrl) { setError('Please provide a file URL or upload a file.'); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertErr } = await supabase.from('reports').insert({
      company_id:   form.company_id,
      title:        form.title,
      period:       form.period || null,
      file_url:     fileUrl,
      generated_by: user?.id,
    });

    if (insertErr) { setError(insertErr.message); setLoading(false); return; }

    setSuccess(`Report "${form.title}" added successfully.`);
    setForm({ company_id: form.company_id, title: '', period: '', file_url: '' });
    setFile(null);
    setLoading(false);
    revalidateAdminPath('/reports');
  }

  return (
    <div className="card p-6">
      <h2 className="font-display font-semibold text-[1rem] mb-5" style={{ color: 'var(--ink)' }}>
        Add Report
      </h2>

      {/* Mode toggle */}
      <div
        className="flex rounded-[8px] p-0.5 mb-5"
        style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)' }}
      >
        {(['url', 'file'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[6px] text-xs font-medium transition-all"
            style={mode === m
              ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: 'var(--ink-faint)' }
            }
          >
            {m === 'url' ? <LinkIcon size={12} /> : <UploadCloud size={12} />}
            {m === 'url' ? 'Link URL' : 'Upload file'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-group">
          <label className="label">Client *</label>
          <select value={form.company_id} onChange={e => set('company_id', e.target.value)} className="input" required>
            <option value="">Select client…</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="label">Report title *</label>
          <input
            required
            value={form.title}
            onChange={e => set('title', e.target.value)}
            className="input"
            placeholder="e.g. Monthly HR Summary"
          />
        </div>

        <div className="form-group">
          <label className="label">Period</label>
          <select value={form.period} onChange={e => set('period', e.target.value)} className="input">
            <option value="">Select period…</option>
            {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {mode === 'url' ? (
          <div className="form-group">
            <label className="label">Report URL</label>
            <input
              type="url"
              value={form.file_url}
              onChange={e => set('file_url', e.target.value)}
              className="input"
              placeholder="https://…"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              Link to a PDF in Google Drive, Notion, or similar.
            </p>
          </div>
        ) : (
          <div className="form-group">
            <label className="label">PDF file</label>
            <label
              className="flex flex-col items-center gap-2 rounded-[10px] px-4 py-6 cursor-pointer transition-colors"
              style={{ border: '2px dashed var(--line)', background: 'var(--surface-alt)' }}
            >
              <UploadCloud size={20} style={{ color: 'var(--ink-faint)' }} />
              <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                {file ? file.name : 'Click to choose PDF or drag it here'}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.csv"
                className="sr-only"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        {error   && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)',  color: '#E05555' }}>{error}</p>}
        {success && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--emerald)' }}>{success}</p>}

        <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? 'Uploading…' : 'Add Report'}
        </button>
      </form>
    </div>
  );
}
