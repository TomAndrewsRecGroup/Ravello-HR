'use client';
import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

interface Doc { id: string; title: string; category: string | null; url: string | null }

// Lazily fetched — a scan's first paint never pays for this query, it
// only runs once the worker actually expands "Documents".
export default function DocumentsList({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function expand() {
    setOpen(true);
    if (docs || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/w/${encodeURIComponent(token)}/documents`);
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Could not load documents.'); return; }
      setDocs(body.documents ?? []);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return <button type="button" className="btn-ghost btn-sm w-full justify-center" onClick={expand}>View site documents</button>;
  }

  return (
    <div className="space-y-2">
      <p className="label">Documents</p>
      {loading && <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}><Loader2 size={12} className="animate-spin" /> Loading…</p>}
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
      {docs && docs.length === 0 && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No documents on record yet.</p>}
      {docs && docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-2 text-sm" style={{ minHeight: 36 }}>
              <FileText size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
              {d.url
                ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--blue)' }}>{d.title}</a>
                : <span style={{ color: 'var(--ink-soft)' }}>{d.title}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
