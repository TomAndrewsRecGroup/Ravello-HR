'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Package } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { HS_REGISTER_CATEGORY_LABELS } from '@/lib/hs/vocab';
import { describeRecurrence } from '@/lib/hs/recurrence';
import { firstDueDate, itemsToApply } from '@/lib/hs/sectorPacks';
import type { HsSectorPack, HsSectorPackItem } from '@/lib/hs/types';

interface Props {
  companyId: string;
  packs: (HsSectorPack & { items: HsSectorPackItem[] })[];
  existingTitles: string[];
  onDone: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function ApplyPackPanel({ companyId, packs, existingTitles, onDone }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const pack = packs.find(p => p.id === packId) ?? null;
  const toApply = useMemo(
    () => (pack ? itemsToApply(pack.items, existingTitles) : []),
    [pack, existingTitles],
  );
  const alreadyOnRegister = (pack?.items.length ?? 0) - toApply.length;

  async function apply() {
    if (!pack || toApply.length === 0) return;
    setBusy(true);
    const day = today();
    const rows = toApply.map(i => ({
      company_id: companyId,
      title: i.title,
      category: i.category,
      description: i.description,
      due_date: firstDueDate(i, day),
      recurrence_every: i.recurrence_every,
      recurrence_unit: i.recurrence_unit,
      legal_basis: i.legal_basis,
      source: 'pack' as const,
    }));
    const { error } = await createClient().from('compliance_items').insert(rows);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Added ${rows.length} item${rows.length === 1 ? '' : 's'} from the ${pack.name} pack`, 'success');
    onDone();
    router.refresh();
  }

  if (packs.length === 0) {
    return <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>No sector packs are set up yet.</p>;
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Package size={15} style={{ color: 'var(--purple)' }} />
        <span className="label">Apply a sector pack</span>
      </div>
      <select className="input" value={packId} onChange={e => setPackId(e.target.value)}>
        {packs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {pack?.description && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{pack.description}</p>}

      {pack && (
        <ul className="text-sm space-y-1 max-h-64 overflow-y-auto rounded-lg p-2" style={{ border: '1px solid var(--line)' }}>
          {pack.items.map(i => {
            const already = !toApply.some(t => t.id === i.id);
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 py-0.5" style={{ opacity: already ? 0.45 : 1 }}>
                <span>
                  {i.title}
                  <span className="ml-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    · {HS_REGISTER_CATEGORY_LABELS[i.category as keyof typeof HS_REGISTER_CATEGORY_LABELS] ?? i.category}
                    · {describeRecurrence(i.recurrence_every, i.recurrence_unit)}
                  </span>
                </span>
                {already && <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-faint)' }}>already on register</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {toApply.length} new item{toApply.length === 1 ? '' : 's'} to add
          {alreadyOnRegister > 0 && `, ${alreadyOnRegister} already on the register`}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onDone}>Cancel</button>
          <button type="button" className="btn-cta btn-sm" disabled={busy || toApply.length === 0} onClick={apply}>
            {busy && <Loader2 size={13} className="animate-spin" />} Add {toApply.length || ''} item{toApply.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
