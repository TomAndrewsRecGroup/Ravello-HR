'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface Props {
  companyId:    string;
  companyName:  string;
  archivedAt:   string | null;
}

export default function ClientDangerZone({ companyId, companyName, archivedAt }: Props) {
  const router = useRouter();
  const [busy,     setBusy]     = useState<'archive' | 'unarchive' | 'delete' | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [showDel,  setShowDel]  = useState(false);
  const [confirm,  setConfirm]  = useState('');

  const isArchived = !!archivedAt;

  async function archive() {
    if (!confirm_(`Archive ${companyName}? Their portal access will be blocked but all data stays in Supabase. You can unarchive later.`)) return;
    setBusy('archive'); setError(null);
    try {
      const res = await fetch(`/api/clients/${companyId}/archive`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Archive failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setBusy(null);
    }
  }

  async function unarchive() {
    setBusy('unarchive'); setError(null);
    try {
      const res = await fetch(`/api/clients/${companyId}/unarchive`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Unarchive failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unarchive failed');
    } finally {
      setBusy(null);
    }
  }

  async function deleteClient() {
    if (confirm.trim().toLowerCase() !== companyName.trim().toLowerCase()) {
      setError('The confirmation must exactly match the company name.');
      return;
    }
    setBusy('delete'); setError(null);
    try {
      const res = await fetch(`/api/clients/${companyId}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirm }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Delete failed');
      router.push('/clients');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(null);
    }
  }

  return (
    <div
      className="card p-6"
      style={{ border: '1px solid rgba(220,38,38,0.18)', background: 'rgba(220,38,38,0.02)' }}
    >
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle size={16} style={{ color: '#DC2626', marginTop: 2 }} />
        <div>
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Danger zone</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            Archive blocks portal access but keeps all data. Delete wipes the client and every user permanently.
          </p>
        </div>
      </div>

      {/* Archive / unarchive */}
      <div className="flex items-center justify-between py-3" style={{ borderTop: '1px solid var(--line)' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {isArchived ? 'Archived' : 'Active'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            {isArchived
              ? `Archived on ${new Date(archivedAt!).toLocaleDateString('en-GB')}. Portal access blocked. All data preserved.`
              : 'Portal access enabled. Listed in admin views.'}
          </p>
        </div>
        {isArchived ? (
          <button onClick={unarchive} disabled={busy !== null} className="btn-secondary btn-sm">
            {busy === 'unarchive' ? <Loader2 size={11} className="animate-spin" /> : <ArchiveRestore size={11} />}
            Unarchive
          </button>
        ) : (
          <button onClick={archive} disabled={busy !== null} className="btn-secondary btn-sm">
            {busy === 'archive' ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
            Archive
          </button>
        )}
      </div>

      {/* Hard delete */}
      <div className="py-3" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Permanently delete client</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
              Deletes the company, every related row, and every login. Cannot be undone.
            </p>
          </div>
          {!showDel && (
            <button onClick={() => setShowDel(true)} className="btn-sm" style={{ color: '#DC2626', background: 'transparent', border: '1px solid rgba(220,38,38,0.30)' }}>
              <Trash2 size={11} /> Delete client
            </button>
          )}
        </div>

        {showDel && (
          <div className="rounded-[10px] p-4 mt-3" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)' }}>
            <p className="text-xs mb-3 leading-relaxed" style={{ color: '#7F1D1D' }}>
              Type <strong style={{ fontFamily: 'monospace' }}>{companyName}</strong> exactly to confirm.
              Every user in this company will be signed out and removed from auth.users.
              All requisitions, candidates, tickets, documents, employee records, leave, training, etc. will be wiped.
              This <strong>cannot be undone</strong>.
            </p>
            <input
              type="text"
              className="input w-full mb-3"
              placeholder={companyName}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={deleteClient}
                disabled={busy !== null || confirm.trim().toLowerCase() !== companyName.trim().toLowerCase()}
                className="btn-sm"
                style={{
                  color: '#fff',
                  background: '#DC2626',
                  opacity: confirm.trim().toLowerCase() !== companyName.trim().toLowerCase() ? 0.4 : 1,
                  border: 'none',
                }}
              >
                {busy === 'delete' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Delete permanently
              </button>
              <button onClick={() => { setShowDel(false); setConfirm(''); setError(null); }} className="btn-ghost btn-sm" disabled={busy !== null}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs mt-3" style={{ color: '#DC2626' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// Inline because window.confirm is shadowed by the local `confirm` state name.
function confirm_(msg: string): boolean {
  return typeof window !== 'undefined' && window.confirm(msg);
}
