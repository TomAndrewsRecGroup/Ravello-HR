'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, Trash2, Image as ImageIcon } from 'lucide-react';

type LogoKind = 'company' | 'partner' | 'training_provider';

interface Props {
  kind:        LogoKind;
  targetId:    string;
  currentUrl:  string | null;
  /** Display name used as the alt text and for the fallback initials. */
  alt:         string;
  /** Pixel size of the preview square. Default 64. */
  size?:       number;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_BYTES = 2 * 1024 * 1024;

export default function LogoUpload({ kind, targetId, currentUrl, alt, size = 64 }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy,    setBusy]    = useState<'upload' | 'remove' | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [url,     setUrl]     = useState<string | null>(currentUrl);

  async function upload(f: File) {
    if (!f.type.startsWith('image/')) { setError('Only image files are allowed.'); return; }
    if (f.size > MAX_BYTES)            { setError('File too large (2 MB max).');   return; }
    setBusy('upload'); setError(null);
    try {
      const body = new FormData();
      body.set('kind',     kind);
      body.set('targetId', targetId);
      body.set('file',     f);
      const res = await fetch('/api/admin/logos', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed');
      setUrl(json.url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm('Remove this logo?')) return;
    setBusy('remove'); setError(null);
    try {
      const res = await fetch('/api/admin/logos', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ kind, targetId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Remove failed');
      setUrl(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusy(null);
    }
  }

  const initials = alt.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy !== null}
        className="rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{
          width: size, height: size,
          background: url ? '#fff' : 'var(--surface-alt)',
          border: '1px dashed var(--line)',
          cursor: 'pointer',
        }}
        title={url ? 'Replace logo' : 'Upload logo'}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <div className="flex flex-col items-center" style={{ color: 'var(--ink-faint)' }}>
            <ImageIcon size={Math.round(size * 0.32)} />
            <span className="text-[9px] font-bold mt-0.5">{initials || 'LOGO'}</span>
          </div>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
      />

      <div className="flex flex-col gap-1">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="btn-ghost btn-sm"
          >
            {busy === 'upload' ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            <span className="text-[11px]">{url ? 'Replace' : 'Upload'}</span>
          </button>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="btn-ghost btn-sm"
              style={{ color: 'var(--danger, #DC2626)' }}
            >
              {busy === 'remove' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              <span className="text-[11px]">Remove</span>
            </button>
          )}
        </div>
        <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>PNG / JPG / WEBP / SVG · 2 MB max</p>
        {error && <p className="text-[10px]" style={{ color: 'var(--danger, #DC2626)' }}>{error}</p>}
      </div>
    </div>
  );
}
