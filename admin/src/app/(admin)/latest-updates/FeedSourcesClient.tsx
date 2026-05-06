'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Rss, Loader2, Plus, Trash2, RefreshCw, Power, PowerOff, AlertCircle, CheckCircle2, Code,
  ChevronDown, ChevronRight, Wand2, ExternalLink,
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
  scrape_config: Record<string, unknown> | null;
}

interface Props { initial: FeedSourceRow[] }

const EXAMPLE_CONFIG = `{
  "list_url": "https://www.cipd.org/knowledge/",
  "item": "article.card",
  "title": "h3",
  "link": "a",
  "image": "img",
  "date": "time",
  "description": "p.summary"
}`;

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

  const [sourceType, setSourceType] = useState<'rss' | 'html'>('rss');
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [category, setCategory] = useState('');
  const [scrapeConfig, setScrapeConfig] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set());
  const [rowFlash, setRowFlash] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Local mirror of server data so single-row edits + deletes can update
  // the UI instantly. router.refresh() is only used when we need the
  // server to compute fields we can't derive client-side (create timestamps,
  // refresh-source result counts).
  const [rows, setRows] = useState<FeedSourceRow[]>(initial);

  // Probe state — paste a URL, click Fetch, the rest of the form is
  // auto-filled from the parsed feed.
  const [probing, setProbing] = useState(false);
  const [probeError,   setProbeError]   = useState<string | null>(null);
  const [probePreview, setProbePreview] = useState<{
    item_count: number;
    items: Array<{ title: string; description: string | null; image_url: string | null; url: string }>;
  } | null>(null);

  async function probeFeed() {
    if (!feedUrl.trim()) { setProbeError('Paste a feed URL first.'); return; }
    setProbing(true); setProbeError(null); setProbePreview(null);
    try {
      const res = await fetch('/api/admin/feed-sources/probe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: feedUrl.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? `Probe failed (${res.status})`);
      }
      // Auto-fill any blank fields. Don't clobber what the operator
      // already typed — they win on conflict.
      if (!displayName.trim() && body.display_name) setDisplayName(body.display_name);
      if (!slug.trim()         && body.slug)        setSlug(body.slug);
      if (!category.trim()     && body.category)    setCategory(body.category);
      setProbePreview({ item_count: body.item_count, items: body.preview_items });
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : 'Probe failed.');
    } finally {
      setProbing(false);
    }
  }

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

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!slug.trim() || !displayName.trim() || !feedUrl.trim()) return;
    setSubmitting(true);
    setFormError('');

    let parsedConfig: unknown = undefined;
    if (sourceType === 'html') {
      if (!scrapeConfig.trim()) {
        setFormError('Scrape config is required for HTML sources');
        setSubmitting(false);
        return;
      }
      try {
        parsedConfig = JSON.parse(scrapeConfig);
      } catch {
        setFormError('Scrape config must be valid JSON');
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/feed-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug.trim(),
          display_name: displayName.trim(),
          feed_url: feedUrl.trim(),
          source_type: sourceType,
          category: category.trim() || null,
          scrape_config: parsedConfig,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to add feed');

      // Prepend the new source to the table immediately so the
      // operator sees it without a manual refresh. Falls back to a
      // synthesised row if the server didn't return the full record
      // (older deploys); router.refresh() will reconcile any
      // server-derived fields on the next render.
      const newRow: FeedSourceRow = json.row ?? {
        id:               json.id,
        slug:             slug.trim(),
        display_name:     displayName.trim(),
        feed_url:         feedUrl.trim(),
        source_type:      sourceType,
        category:         category.trim() || null,
        active:           true,
        last_fetched_at:  null,
        last_error:       null,
        created_at:       new Date().toISOString(),
        scrape_config:    (parsedConfig as Record<string, unknown> | null) ?? null,
      };
      setRows((curr) => [newRow, ...curr]);

      // Reset the entire add-source panel: form fields, type and
      // probe state so the next URL starts from a clean slate.
      setSlug(''); setDisplayName(''); setFeedUrl(''); setCategory(''); setScrapeConfig('');
      setSourceType('rss');
      setProbePreview(null);
      setProbeError(null);
      setFormError('');

      refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    busy(id, true);
    // Optimistic: apply the patch to the local row immediately.
    // The body shape here is always a partial of FeedSourceRow.
    const prev = rows.find(r => r.id === id);
    if (prev) {
      setRows(curr => curr.map(r => r.id === id ? { ...r, ...body } as FeedSourceRow : r));
    }
    try {
      const res = await fetch(`/api/admin/feed-sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Roll back the optimistic mutation
        if (prev) setRows(curr => curr.map(r => r.id === id ? prev : r));
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Update failed');
        return;
      }
    } finally {
      busy(id, false);
    }
  }

  async function saveScrapeConfig(id: string, raw: string) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { alert('Config must be valid JSON'); return; }
    await patch(id, { scrape_config: parsed });
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
    // Optimistic: drop the row from the local list immediately.
    const prev = rows;
    setRows(curr => curr.filter(r => r.id !== id));
    try {
      const res = await fetch(`/api/admin/feed-sources/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // Roll back
        setRows(prev);
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Delete failed');
        return;
      }
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
          Feed sources
        </h2>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          RSS feeds and HTML scrapers are pulled into the public feed every hour.
        </span>
      </div>

      {/* Create form */}
      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[110px_140px_1fr_1fr_140px] gap-3 items-end">
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={sourceType}
              onChange={e => setSourceType(e.target.value as 'rss' | 'html')}
            >
              <option value="rss">RSS</option>
              <option value="html">HTML</option>
            </select>
          </div>
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
            <label className="label flex items-center justify-between">
              <span>{sourceType === 'rss' ? 'Feed URL' : 'Page URL'}</span>
              {sourceType === 'rss' && (
                <button
                  type="button"
                  onClick={probeFeed}
                  disabled={probing || !feedUrl.trim()}
                  className="btn-ghost btn-sm inline-flex items-center gap-1"
                  title="Fetch the feed and auto-fill display name, slug and category"
                >
                  {probing ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                  <span className="text-[11px]">Fetch &amp; auto-fill</span>
                </button>
              )}
            </label>
            <input
              className="input"
              placeholder={sourceType === 'rss'
                ? 'https://www.example.com/rss.xml'
                : 'https://www.cipd.org/knowledge/'}
              value={feedUrl}
              onChange={e => { setFeedUrl(e.target.value); setProbeError(null); setProbePreview(null); }}
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
        </div>

        {sourceType === 'html' && (
          <div>
            <label className="label flex items-center gap-1.5">
              <Code size={12} /> Scrape config (JSON)
            </label>
            <textarea
              className="input font-mono text-xs"
              rows={8}
              placeholder={EXAMPLE_CONFIG}
              value={scrapeConfig}
              onChange={e => setScrapeConfig(e.target.value)}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
            <p className="text-[11px] mt-2" style={{ color: 'var(--ink-faint)' }}>
              CSS selectors run against the page. <code>item</code> is required; the rest default to <code>h1-h4</code> for title, <code>a</code> for link, <code>img</code> for image, <code>time</code> for date, <code>p</code> for description.
            </p>
          </div>
        )}

        {/* Probe preview / error */}
        {probeError && (
          <div className="rounded-md p-3 text-xs flex items-start gap-2"
               style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)', color: '#7F1D1D' }}>
            <AlertCircle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{probeError}</span>
          </div>
        )}
        {probePreview && (
          <div className="rounded-md p-3"
               style={{ background: 'rgba(20,184,166,0.04)', border: '1px solid rgba(20,184,166,0.20)' }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={13} style={{ color: 'var(--teal)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                Feed parsed: {probePreview.item_count} item{probePreview.item_count === 1 ? '' : 's'} found
              </span>
              <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                · Form auto-filled. Review &amp; click Add source.
              </span>
            </div>
            <ul className="space-y-2">
              {probePreview.items.map((it, i) => (
                <li key={i} className="flex gap-3 text-xs">
                  {it.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={it.image_url} alt="" width={48} height={48}
                         style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover', flexShrink: 0, background: 'var(--surface-alt)' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 4, background: 'var(--surface-alt)', flexShrink: 0 }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate" style={{ color: 'var(--ink)' }}>{it.title}</p>
                    {it.description && (
                      <p className="text-[11px] line-clamp-2" style={{ color: 'var(--ink-faint)' }}>{it.description}</p>
                    )}
                    <a href={it.url} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--purple)' }}>
                      open <ExternalLink size={9} />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {formError && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>{formError}</p>
          )}
          <button
            className="btn-cta flex items-center gap-2 ml-auto"
            onClick={create}
            disabled={submitting || !slug.trim() || !displayName.trim() || !feedUrl.trim()}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add source
          </button>
        </div>
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
            No feeds yet. Add one above.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {rows.map(r => {
              const isBusy = rowBusy.has(r.id);
              const flash = rowFlash[r.id];
              const isExpanded = expanded.has(r.id);
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
                      <span className="badge" style={{
                        background: r.source_type === 'html' ? 'rgba(59,111,255,0.08)' : 'var(--surface-alt)',
                        color: r.source_type === 'html' ? 'var(--blue)' : 'var(--ink-soft)',
                      }}>
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
                      {r.source_type === 'html' && (
                        <button
                          onClick={() => toggleExpand(r.id)}
                          className="flex items-center gap-0.5 hover:underline"
                          style={{ color: 'var(--purple)' }}
                        >
                          {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          Scrape config
                        </button>
                      )}
                    </div>
                    {flash && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>{flash}</p>
                    )}

                    {isExpanded && r.source_type === 'html' && (
                      <ScrapeConfigEditor
                        id={r.id}
                        initial={r.scrape_config}
                        onSave={saveScrapeConfig}
                      />
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

function ScrapeConfigEditor({
  id, initial, onSave,
}: {
  id: string;
  initial: Record<string, unknown> | null;
  onSave: (id: string, raw: string) => Promise<void>;
}) {
  const [val, setVal] = useState(initial ? JSON.stringify(initial, null, 2) : '');
  const [saving, setSaving] = useState(false);
  return (
    <div className="mt-3 rounded-[10px] p-3" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
      <textarea
        className="input font-mono text-xs w-full"
        rows={8}
        value={val}
        onChange={e => setVal(e.target.value)}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
      />
      <div className="flex justify-end mt-2">
        <button
          className="btn-secondary btn-sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try { await onSave(id, val); } finally { setSaving(false); }
          }}
        >
          {saving ? 'Saving…' : 'Save config'}
        </button>
      </div>
    </div>
  );
}
