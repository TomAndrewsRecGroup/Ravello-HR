'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Link2, Loader2, Plus, Star, StarOff, Eye, EyeOff,
  Trash2, ExternalLink, Code2,
} from 'lucide-react';

export interface UpdateRow {
  id: string;
  source_type: 'manual' | 'rss' | 'html';
  source_url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  published_at: string | null;
  render_mode: 'card' | 'embed';
  embed_kind: 'linkedin' | null;
  embed_ref: string | null;
  status: 'draft' | 'published' | 'hidden';
  featured: boolean;
  featured_order: number | null;
  created_at: string;
}

interface Props { initial: UpdateRow[] }

export default function LatestUpdatesClient({ initial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [url, setUrl] = useState('');
  const [renderMode, setRenderMode] = useState<'card' | 'embed'>('card');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [rows] = useState<UpdateRow[]>(initial);
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set());

  function refresh() {
    startTransition(() => router.refresh());
  }

  function busy(id: string, on: boolean) {
    setRowBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function submit() {
    if (!url.trim()) return;
    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/latest-updates/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), render_mode: renderMode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to ingest URL');
      setUrl('');
      setRenderMode('card');
      refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    busy(id, true);
    try {
      const res = await fetch(`/api/admin/latest-updates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Update failed');
        return;
      }
      refresh();
    } finally {
      busy(id, false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    busy(id, true);
    try {
      const res = await fetch(`/api/admin/latest-updates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Delete failed');
        return;
      }
      refresh();
    } finally {
      busy(id, false);
    }
  }

  return (
    <div className="space-y-6">

      {/* Paste URL form */}
      <div className="card p-6">
        <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>
          Add an entry
        </h2>
        <div className="grid sm:grid-cols-[1fr_160px_auto] gap-3 items-end">
          <div>
            <label className="label">Article or post URL</label>
            <div className="relative">
              <Link2
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--ink-faint)' }}
              />
              <input
                className="input pl-9"
                placeholder="https://www.example.com/article"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              />
            </div>
          </div>
          <div>
            <label className="label">Render as</label>
            <select
              className="input"
              value={renderMode}
              onChange={e => setRenderMode(e.target.value as 'card' | 'embed')}
            >
              <option value="card">Card (auto OG)</option>
              <option value="embed">LinkedIn embed</option>
            </select>
          </div>
          <button
            className="btn-cta flex items-center gap-2"
            onClick={submit}
            disabled={submitting || !url.trim()}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>
        {formError && (
          <p className="text-xs mt-3" style={{ color: 'var(--red)' }}>{formError}</p>
        )}
        <p className="text-xs mt-3" style={{ color: 'var(--ink-faint)' }}>
          Paste any URL — we auto-fetch the title, description and preview image.
          Select <strong>LinkedIn embed</strong> for LinkedIn post URLs to render the native iframe.
        </p>
      </div>

      {/* Entries list */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Entries <span style={{ color: 'var(--ink-faint)' }}>({rows.length})</span>
          </h2>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Featured entries appear in the top carousel on the marketing site.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
            No entries yet. Paste a URL above to add the first one.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {rows.map(r => {
              const isBusy = rowBusy.has(r.id);
              const showOrder = r.featured;
              return (
                <li key={r.id} className="p-4 flex gap-4 items-start">

                  {/* Thumbnail */}
                  <div
                    className="flex-shrink-0 w-20 h-20 rounded-[10px] overflow-hidden"
                    style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)' }}
                  >
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--ink-faint)' }}>
                        <Link2 size={18} />
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
                        {r.source_type}
                      </span>
                      {r.render_mode === 'embed' && (
                        <span className="badge flex items-center gap-1" style={{ background: 'rgba(59,111,255,0.08)', color: 'var(--blue)' }}>
                          <Code2 size={10} /> embed
                        </span>
                      )}
                      <span className="badge" style={{
                        background: r.status === 'published'
                          ? 'rgba(20,184,166,0.08)'
                          : r.status === 'draft'
                          ? 'rgba(191,143,40,0.08)'
                          : 'rgba(116,128,153,0.08)',
                        color: r.status === 'published'
                          ? 'var(--teal)'
                          : r.status === 'draft'
                          ? 'var(--gold)'
                          : 'var(--ink-faint)',
                      }}>
                        {r.status}
                      </span>
                      {r.site_name && (
                        <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          {r.site_name}
                        </span>
                      )}
                    </div>
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-semibold text-sm leading-snug mb-1 hover:underline"
                      style={{ color: 'var(--ink)' }}
                    >
                      {r.title}
                      <ExternalLink size={11} className="inline ml-1 align-baseline" style={{ color: 'var(--ink-faint)' }} />
                    </a>
                    {r.description && (
                      <p className="text-xs line-clamp-2" style={{ color: 'var(--ink-soft)' }}>
                        {r.description}
                      </p>
                    )}

                    {showOrder && (
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          Carousel order
                        </label>
                        <input
                          type="number"
                          className="input"
                          style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                          defaultValue={r.featured_order ?? ''}
                          placeholder="auto"
                          onBlur={e => {
                            const raw = e.target.value.trim();
                            const next = raw === '' ? null : Number(raw);
                            if (next === r.featured_order) return;
                            if (next !== null && Number.isNaN(next)) return;
                            patch(r.id, { featured_order: next });
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="btn-icon btn-sm"
                      title={r.featured ? 'Unfeature' : 'Feature in carousel'}
                      disabled={isBusy}
                      onClick={() => patch(r.id, { featured: !r.featured })}
                      style={r.featured ? { color: 'var(--gold)' } : {}}
                    >
                      {r.featured ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                    </button>
                    <button
                      className="btn-icon btn-sm"
                      title={r.status === 'published' ? 'Hide from public' : 'Publish'}
                      disabled={isBusy}
                      onClick={() => patch(r.id, {
                        status: r.status === 'published' ? 'hidden' : 'published',
                      })}
                    >
                      {r.status === 'published' ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      className="btn-icon btn-sm"
                      title="Delete"
                      disabled={isBusy}
                      onClick={() => remove(r.id)}
                      style={{ color: 'var(--red)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
