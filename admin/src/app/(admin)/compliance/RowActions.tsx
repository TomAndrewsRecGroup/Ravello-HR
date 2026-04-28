'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Trash2, Loader2 } from 'lucide-react';

// Per-row action buttons for a compliance item:
//   - Mark complete (only when status != complete)
//   - Delete with browser confirm
// Used inside the read-only list on /compliance.

export default function RowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'complete' | 'delete' | null>(null);

  async function markComplete() {
    setBusy('complete');
    try {
      await fetch(`/api/admin/compliance/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'complete' }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this compliance item? This cannot be undone.')) return;
    setBusy('delete');
    try {
      await fetch(`/api/admin/compliance/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {status !== 'complete' && (
        <button
          onClick={markComplete}
          disabled={busy !== null}
          className="text-[10px] font-bold px-2 py-1 rounded-md transition-all hover:opacity-90 inline-flex items-center gap-1"
          style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}
          title="Mark complete"
        >
          {busy === 'complete' ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
          Done
        </button>
      )}
      <button
        onClick={remove}
        disabled={busy !== null}
        className="btn-icon btn-sm"
        style={{ color: 'var(--ink-faint)' }}
        title="Delete item"
        aria-label="Delete"
      >
        {busy === 'delete' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
      </button>
    </div>
  );
}
