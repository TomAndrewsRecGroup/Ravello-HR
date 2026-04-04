'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UploadCloud, X, Loader2, FileText } from 'lucide-react';

const UI_CATEGORIES = [
  { label: 'Contract',        value: 'contract', dbCat: 'contract' },
  { label: 'Policy',          value: 'policy',   dbCat: 'policy'   },
  { label: 'Handbook',        value: 'handbook',  dbCat: 'other'   },
  { label: 'Template',        value: 'template',  dbCat: 'other'   },
  { label: 'Role Pack',       value: 'role_pack', dbCat: 'other'   },
  { label: 'Meeting Notes',   value: 'meeting_notes', dbCat: 'other' },
  { label: 'Strategic Plan',  value: 'strategic_plan', dbCat: 'other' },
] as const;

type UICategory = typeof UI_CATEGORIES[number]['value'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface Props {
  companyId: string;
  userId: string;
  onUploaded?: () => void;
}

export default function DocumentUpload({ companyId, userId, onUploaded }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [name, setName]         = useState('');
  const [category, setCategory] = useState<UICategory>('contract');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);

  const pickFile = (f: File) => {
    setFile(f);
    setName(f.name.replace(/\.[^/.]+$/, ''));
    setSuccess(false);
    setError('');
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError('');

    const uiCat = UI_CATEGORIES.find(c => c.value === category)!;
    const ext   = file.name.split('.').pop() ?? '';
    const safeName = name.replace(/[^a-zA-Z0-9._\- ]/g, '_');
    const filePath  = `${companyId}/${category}/${Date.now()}_${safeName}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(filePath, file, { upsert: false });

    if (uploadErr) {
      setError(uploadErr.message);
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    const { error: insertErr } = await supabase.from('documents').insert({
      company_id:        companyId,
      name:              name || file.name,
      category:          uiCat.dbCat as any,
      file_url:          publicUrl,
      file_path:         filePath,
      file_size:         file.size,
      uploaded_by:       userId,
      status:            'active',
      version:           1,
      requires_approval: false,
    });

    if (insertErr) {
      setError(insertErr.message);
      setLoading(false);
      return;
    }

    setFile(null);
    setName('');
    setCategory('contract');
    setSuccess(true);
    setLoading(false);
    onUploaded?.();
    router.refresh();
  }

  return (
    <div className="card p-6 mb-6">
      <p className="eyebrow mb-4">Upload Document</p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !file && inputRef.current?.click()}
        className="rounded-[12px] border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors mb-4"
        style={{
          minHeight: 120,
          borderColor: dragging ? 'var(--purple)' : 'var(--line)',
          background: dragging ? 'rgba(124,58,237,0.04)' : 'var(--surface-alt)',
          cursor: file ? 'default' : 'pointer',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,.xlsx,.png,.jpg,.jpeg"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
        />
        {file ? (
          <div className="flex items-center gap-3 px-4">
            <FileText size={20} style={{ color: 'var(--purple)' }} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setFile(null); setName(''); }}
              className="ml-auto btn-icon flex-shrink-0"
              aria-label="Remove file"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud size={24} style={{ color: 'var(--ink-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Drag &amp; drop or <span style={{ color: 'var(--purple)' }}>browse</span>
            </p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              PDF, Word, Excel, PNG, JPG — max 50MB
            </p>
          </>
        )}
      </div>

      {file && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="label">Document name</label>
              <input
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter document name"
              />
            </div>
            <div className="form-group">
              <label className="label">Category</label>
              <select
                className="input"
                value={category}
                onChange={e => setCategory(e.target.value as UICategory)}
              >
                {UI_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={loading || !name.trim()}
            className="btn-cta"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Uploading…' : 'Upload Document'}
          </button>
        </div>
      )}

      {success && !file && (
        <p className="text-sm mt-2" style={{ color: 'var(--teal)' }}>
          Document uploaded successfully.
        </p>
      )}
    </div>
  );
}
