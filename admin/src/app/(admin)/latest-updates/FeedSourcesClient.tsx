'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Rss, Loader2, Plus, Trash2, RefreshCw, Power, PowerOff, AlertCircle, CheckCircle2,
} from 'lucide-react';

export interface FeedSourceRow {
  id: string;
  slug: string;
  display_name: string;
  feed_url: string;
  source_type: 'rss' | 'html' | 'manual';
  category: string | null;
  active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface Props { initial: FeedSourceRow[] }

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FeedSourcesClient({ initial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set());
  const [rowFlash, setRowFlash] = useState<Record<string, string>>({});

  const rows = initial;

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

  async function create() {
    if (!slug.trim() || !displayName.trim() || !feedUrl.trim()) return;
    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/feed-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug.trim(),
          display_name: displayName.trim(),
          feed_url: feedUrl.trim(),
          category: category.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to add feed');
      setSlug(''); setDisplayName(''); setFeedUrl(''); setCategory('');
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
      const res = await fetch(`/api/admin/feed-sources/${id}`, {
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

  async function refreshSource(id: string) {
    busy(id, true);
    setRowFlash(prev => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch(`/api/admin/feed-sources/${id}/refresh`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRowFlash(prev => ({ ...prev, [id]: j.error ?? 'Refresh failed' }));
        return;
      }
      const r = j.result ?? {};
      setRowFlash(prev => ({
        ...prev,
        [id]: r.error
          ? `Error: ${r.error}`
          : `Fetched ${r.fetched}, inserted ${r.inserted}, skipped ${r.skipped}`,
      }));
      refresh();
    } finally {
      busy(id, false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this feed source? Existing entries will stay but the source link will clear.')) return;
    busy(id, true);
    try {
      const res = await fetch(`/api/admin/feed-sources/${id}`, { method: 'DELETE' });
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
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Rss size={15} style={{ color: 'var(--purple)' }} />
        <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          RSS feed sources
        </h2>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Auto-ingested every hour into the public feed.
        </span>
      </div>

      {/* Create form */}
      <div className="card p-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[160px_1fr_1fr_140px_auto] gap-3 items-end">
          <div>
            <label className="label">Slug</label>
            <input
              className="input"
              placeholder="cipd-news"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase())}
            />
          </div>
          <div>
            <label className="label">Display name</label>
            <input
              className="input"
              placeholder="CIPD News"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Feed URL</label>
            <input
              className="input"
              placeholder="https://www.cipd.org/rss/news.xml"
              value={feedUrl}
              onChange={e => setFeedUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Category</label>
            <input
              className="input"
              placeholder="policy"
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </div>
          <button
            className="btn-cta flex items-center gap-2"
            onClick={create}
            disabled={submitting || !slug.trim() || !displayName.trim() || !feedUrl.trim()}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add feed
          </button>
        </div>
        {formError && (
          <p className="text-xs mt-3" style={{ color: 'var(--red)' }}>{formError}</p>
        )}
        <p className="text-xs mt-3" style={{ color: 'var(--ink-faint)' }}>
          Only RSS / Atom feeds are supported here. HTML scrapers are configured in Phase 3.
        </p>
      </div>

      {/* Feed list */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Sources <span style={{ color: 'var(--ink-faint)' }}>({rows.length})</span>
          </h3>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
            No RSS feeds yet. Add one above.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {rows.map(r => {
              const isBusy = rowBusy.has(r.id);
              const flash = rowFlash[r.id];
              return (
                <li key={r.id} className="p-4 flex gap-4 items-start">

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {r.display_name}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                        /{r.slug}
                      </span>
                      <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
                        {r.source_type}
                      </span>
                      {r.category && (
                        <span className="badge" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}>
                          {r.category}
                        </span>
                      )}
                      <span className="badge" style={{
                        background: r.active ? 'rgba(20,184,166,0.08)' : 'rgba(116,128,153,0.08)',
                        color: r.active ? 'var(--teal)' : 'var(--ink-faint)',
                      }}>
                        {r.active ? 'active' : 'paused'}
                      </span>
                    </div>
                    <a
                      href={r.feed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs hover:underline truncate"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {r.feed_url}
                    </a>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                      <span>Last fetch: {timeAgo(r.last_fetched_at)}</span>
                      {r.last_error ? (
                        <span className="flex items-center gap-1" style={{ color: 'var(--red)' }}>
                          <AlertCircle size={11} /> {r.last_error}
                        </span>
                      ) : r.last_fetched_at ? (
                        <span className="flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                          <CheckCircle2 size={11} /> ok
                        </span>
                      ) : null}
                    </div>
                    {flash && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>{flash}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="btn-icon btn-sm"
                      title="Refresh now"
                      disabled={isBusy}
                      onClick={() => refreshSource(r.id)}
                    >
                      {isBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                    <button
                      className="btn-icon btn-sm"
                      title={r.active ? 'Pause' : 'Resume'}
                      disabled={isBusy}
                      onClick={() => patch(r.id, { active: !r.active })}
                    >
                      {r.active ? <Power size={14} /> : <PowerOff size={14} />}
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
