import type { Metadata } from 'next';
import { Package } from 'lucide-react';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HS_REGISTER_CATEGORY_LABELS, type HsRegisterCategory } from '@/lib/hs/vocab';
import { describeRecurrence } from '@/lib/hs/recurrence';
import type { HsSectorPack, HsSectorPackItem } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Sector Packs' };
export const revalidate = 60;

// Reference data staff browse before applying a pack to a client's
// register (the "Apply sector pack" action lives on the client's own
// register page — a pack is applied TO a company, not from here).
export default async function SectorPacksPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: packs }, { data: items }] = await Promise.all([
    supabase.from('hs_sector_packs').select('id, sector, name, description').order('name'),
    supabase.from('hs_sector_pack_items').select('id, pack_id, category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order').order('sort_order'),
  ]);

  return (
    <>
      <AdminTopbar title="Sector Packs" subtitle="Typical H&S register items by sector — apply one from a client's register page" />
      <main className="admin-page flex-1 space-y-4">
        {(packs ?? []).length === 0 ? (
          <div className="card empty-state p-10">
            <Package size={28} style={{ color: 'var(--ink-faint)' }} />
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No sector packs set up yet.</p>
          </div>
        ) : (
          (packs as HsSectorPack[]).map(p => {
            const packItems = (items as HsSectorPackItem[] ?? []).filter(i => i.pack_id === p.id);
            return (
              <details key={p.id} className="card p-4" open={false}>
                <summary className="cursor-pointer font-display font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  <Package size={15} style={{ color: 'var(--purple)' }} />
                  {p.name}
                  <span className="text-xs font-normal ml-auto" style={{ color: 'var(--ink-faint)' }}>{packItems.length} items</span>
                </summary>
                {p.description && <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>{p.description}</p>}
                <ul className="mt-3 divide-y" style={{ borderColor: 'var(--line)' }}>
                  {packItems.map(i => (
                    <li key={i.id} className="py-2 text-sm">
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>{i.title}</span>
                      <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                        {HS_REGISTER_CATEGORY_LABELS[i.category as HsRegisterCategory] ?? i.category}
                        {' · '}{describeRecurrence(i.recurrence_every, i.recurrence_unit)}
                        {i.legal_basis && ` · ${i.legal_basis}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })
        )}
      </main>
    </>
  );
}
