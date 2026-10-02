'use client';

// Shareable report links (go-live gap list, item 7). The caller
// supplies its own correct API base path — admin's `/api/admin/reports/
// <id>/share`, portal's `/api/reports/<id>/share` — the same "each page
// supplies its own correct href/path" precedent `ConnectionsPanel.tsx`/
// `EvidenceLinksPanel.tsx` already establish for a shared component that
// serves both apps.
//
// The raw share URL is shown exactly ONCE, right after minting — it is
// never stored anywhere and this component never asks for it back.
// Everything else shown here (recipient note, expiry, access count) is
// safe, non-sensitive metadata.

import { useState } from 'react';
import { Share2, Copy, Check, Loader2, X } from 'lucide-react';

interface ShareLink {
  tokenHashPrefix: string;
  createdByName:  string;
  recipientNote:  string | null;
  expiresAt:      string;
  revokedAt:      string | null;
  lastAccessedAt: string | null;
  accessCount:    number;
  createdAt:      string;
}

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ShareReportButton({ reportId, apiBase }: { reportId: string; apiBase: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [ttlDays, setTtlDays] = useState(30);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [minting, setMinting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${reportId}/share`);
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? 'Could not load share links'); return; }
      setLinks(j.links ?? []);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && links === null) await load();
  }

  async function mint() {
    setMinting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${reportId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientNote: note.trim() || undefined, ttlDays }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? 'Could not create a share link'); return; }
      setNewUrl(j.url);
      setNote('');
      await load();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setMinting(false);
    }
  }

  async function revoke(tokenHashPrefix: string) {
    const ok = window.confirm('Revoke this link? Anyone holding it will lose access immediately.');
    if (!ok) return;
    setError(null);
    const res = await fetch(`${apiBase}/${reportId}/share`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenHashPrefix }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Could not revoke this link'); return; }
    await load();
  }

  async function copy() {
    if (!newUrl) return;
    try { await navigator.clipboard.writeText(newUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }

  return (
    <>
      <button type="button" onClick={toggle} className="btn-secondary btn-sm flex items-center gap-1.5 w-fit">
        <Share2 size={12} /> Share
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share this report"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(7,11,32,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
        <div className="card p-4" style={{ width: 360, maxWidth: '100%', boxShadow: '0 24px 64px rgba(7,11,32,0.30)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Share this report</p>
            <button type="button" onClick={() => setOpen(false)} className="btn-icon btn-sm" aria-label="Close">
              <X size={13} />
            </button>
          </div>

          {error && <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>{error}</p>}

          {newUrl && (
            <div className="card p-2 mb-3" style={{ background: 'var(--surface-soft)' }}>
              <p className="text-[11px] mb-1" style={{ color: 'var(--ink-faint)' }}>
                Link created — copy it now. It won't be shown again.
              </p>
              <div className="flex items-center gap-1.5">
                <input readOnly value={newUrl} className="input text-xs flex-1" onFocus={e => e.currentTarget.select()} />
                <button type="button" onClick={copy} className="btn-icon btn-sm" aria-label="Copy link">
                  {copied ? <Check size={13} style={{ color: 'var(--teal)' }} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-1.5 mb-3">
            <div className="flex-1">
              <label className="label text-[11px]">For (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. our insurer" className="input text-xs" maxLength={200} />
            </div>
            <div>
              <label className="label text-[11px]">Expires</label>
              <select value={ttlDays} onChange={e => setTtlDays(Number(e.target.value))} className="input text-xs">
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
          </div>
          <button type="button" onClick={mint} disabled={minting} className="btn-cta btn-sm w-full flex items-center justify-center gap-1.5 mb-3">
            {minting && <Loader2 size={12} className="animate-spin" />} Create link
          </button>

          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-faint)' }}>Existing links</p>
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Loading…</p>
          ) : !links || links.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No links yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {links.map(l => {
                const isLive = !l.revokedAt && new Date(l.expiresAt).getTime() > Date.now();
                return (
                  <li key={l.tokenHashPrefix} className="flex items-center justify-between text-xs">
                    <div>
                      <p style={{ color: 'var(--ink)' }}>{l.recipientNote || 'Untitled link'}</p>
                      <p style={{ color: 'var(--ink-faint)' }}>
                        {l.revokedAt ? 'Revoked' : isLive ? `Expires ${fmt(l.expiresAt)}` : 'Expired'} · opened {l.accessCount}×
                      </p>
                    </div>
                    {isLive && (
                      <button type="button" onClick={() => revoke(l.tokenHashPrefix)} className="btn-ghost btn-sm" style={{ color: 'var(--red)' }}>
                        Revoke
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </div>
      )}
    </>
  );
}
