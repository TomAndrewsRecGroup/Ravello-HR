'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface LinkedRecord { linkId: string; type: string; id: string; label: string; href: string | null; status?: string | null }
export interface LinkOption { type: string; id: string; label: string }

// Typed relationships (hs_links, 122) from a RAMS or COSHH assessment
// to other safety records. The trigger checks both ends are records of
// the same organisation; RLS decides who may add or remove.
export default function RamsCoshhLinks({ fromType, fromId, linked, options, typeLabels, canEdit, emptyText }: {
  fromType: string; fromId: string; linked: LinkedRecord[]; options: LinkOption[];
  typeLabels: Record<string, string>; canEdit: boolean; emptyText: string;
}) {
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const already = new Set(linked.map(l => `${l.type}:${l.id}`));
  const available = options.filter(o => !already.has(`${o.type}:${o.id}`));

  async function add() {
    const [type, id] = pick.split(':');
    if (!type || !id) return;
    setBusy(true); setError(null);
    const { error: err } = await createClient().from('hs_links').insert({
      // company_id is set by the trigger from the records themselves.
      from_type: fromType, from_id: fromId, to_type: type, to_id: id, relation: 'related',
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setPick('');
    router.refresh();
  }

  async function remove(linkId: string) {
    setBusy(true); setError(null);
    const { error: err, count } = await createClient().from('hs_links').delete({ count: 'exact' }).eq('id', linkId);
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (count === 0) { setError('The link was not removed. You may not have permission.'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {linked.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{emptyText}</p> : (
        <ul className="text-sm space-y-1">
          {linked.map(l => (
            <li key={l.linkId} className="flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{typeLabels[l.type] ?? l.type}</span>
              {l.href ? <Link href={l.href}>{l.label}</Link> : <span style={{ color: 'var(--ink)' }}>{l.label}</span>}
              {l.status && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>· {l.status}</span>}
              {canEdit && (
                <button type="button" className="btn-icon no-print" aria-label="Remove link" onClick={() => remove(l.linkId)} disabled={busy}>
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 no-print">
          <label className="block flex-1 min-w-[220px]"><span className="label">Link a record</span>
            <select className="input" value={pick} onChange={e => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {Object.keys(typeLabels).map(t => {
                const opts = available.filter(o => o.type === t);
                return opts.length ? (
                  <optgroup key={t} label={typeLabels[t]}>
                    {opts.map(o => <option key={o.id} value={`${o.type}:${o.id}`}>{o.label}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          <button type="button" className="btn-secondary btn-sm" onClick={add} disabled={busy || !pick}>
            {busy && <Loader2 size={14} className="animate-spin" />} Link
          </button>
        </div>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
