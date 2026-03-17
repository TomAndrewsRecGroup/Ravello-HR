'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Upload } from 'lucide-react';

const CATEGORIES = ['contract','policy','letter','report','other'];

export default function DocumentUploadPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [companies, setCompanies] = useState<{id:string;name:string}[]>([]);
  const [form,    setForm]    = useState({ company_id:'', name:'', category:'policy', review_due_at:'', notes:'' });
  const [file,    setFile]    = useState<File|null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    supabase.from('companies').select('id,name').eq('active',true).order('name')
      .then(({ data }) => setCompanies(data ?? []));
  }, []);

  function set(k:string, v:string) { setForm(p=>({...p,[k]:v})); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }
    setLoading(true); setError('');

    // Upload to Supabase Storage
    const path = `${form.company_id}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(path, file, { contentType: file.type });

    if (uploadErr) { setError(uploadErr.message); setLoading(false); return; }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);

    const { data: { user } } = await supabase.auth.getUser();
    const { error: dbErr } = await supabase.from('documents').insert({
      company_id:     form.company_id,
      name:           form.name || file.name,
      category:       form.category,
      file_url:       publicUrl,
      file_size:      file.size,
      version:        1,
      uploaded_by:    user?.id ?? '',
      review_due_at:  form.review_due_at || null,
      notes:          form.notes || null,
    });

    if (dbErr) { setError(dbErr.message); setLoading(false); return; }
    router.push('/documents');
  }

  return (
    <>
      <AdminTopbar title="Upload Document" actions={<button onClick={()=>router.back()} className="btn-secondary btn-sm">Cancel</button>} />
      <main className="admin-page flex-1 max-w-[580px]">
        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div className="form-group">
            <label className="label">Client *</label>
            <select required value={form.company_id} onChange={e=>set('company_id',e.target.value)} className="input">
              <option value="">Select client…</option>
              {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Document name</label>
            <input value={form.name} onChange={e=>set('name',e.target.value)} className="input" placeholder="e.g. Employment Contract Template (defaults to filename)" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="label">Category *</label>
              <select value={form.category} onChange={e=>set('category',e.target.value)} className="input">
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Review due date</label>
              <input type="date" value={form.review_due_at} onChange={e=>set('review_due_at',e.target.value)} className="input" />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Notes (optional)</label>
            <input value={form.notes} onChange={e=>set('notes',e.target.value)} className="input" placeholder="Any context about this document" />
          </div>
          <div className="form-group">
            <label className="label">File *</label>
            <div
              className="rounded-[10px] border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
              style={{ borderColor: file ? 'var(--purple)' : 'var(--line)', background: file ? 'rgba(143,114,246,0.04)' : 'var(--surface-alt)' }}
              onClick={()=>document.getElementById('file-input')?.click()}
            >
              <Upload size={20} className="mx-auto mb-2" style={{ color: 'var(--ink-faint)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                {file ? file.name : 'Click to select file (PDF, DOCX, XLSX)'}
              </p>
              <input id="file-input" type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>setFile(e.target.files?.[0]??null)} />
            </div>
          </div>
          {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Uploading…' : 'Upload Document'}
          </button>
        </form>
      </main>
    </>
  );
}
