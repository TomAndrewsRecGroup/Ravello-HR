import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsCompletion, HsFile, HsRegisterItem, HsSectorPack, HsSectorPackItem } from '@/lib/hs/types';
import RegisterClient from '@/components/hs/RegisterClient';

export const metadata: Metadata = { title: 'H&S register' };
export const dynamic = 'force-dynamic';

// The client's H&S register: statutory and recurring items, when each
// was last done, when it is next due, and the evidence.
export default async function HealthSafetyRegisterPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  // All in parallel and paged: a register, its completions and its
  // files all grow without bound over the years a client is with us.
  // Sector packs are small, staff-wide reference data (no readAllPages
  // needed — a handful of packs and a few hundred items at most).
  const [items, completions, files, { data: packRows }, { data: packItemRows }] = await Promise.all([
    readAllPages<HsRegisterItem>((from, to) =>
      supabase.from('compliance_items')
        .select('id, company_id, title, description, category, status, due_date, recurrence_every, recurrence_unit, last_completed_on, legal_basis, source, site_id')
        .eq('company_id', params.companyId)
        .eq('domain', 'hs')
        .order('due_date', { ascending: true, nullsFirst: false }).order('id')
        .range(from, to)),
    readAllPages<HsCompletion>((from, to) =>
      supabase.from('hs_register_completions')
        .select('id, item_id, completed_on, outcome, notes, next_due_on, recorded_by_kind, created_at')
        .eq('company_id', params.companyId)
        .order('completed_on', { ascending: false }).order('id')
        .range(from, to)),
    readAllPages<HsFile>((from, to) =>
      supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', params.companyId)
        .in('entity_type', ['register_item', 'register_completion'])
        .order('created_at', { ascending: false }).order('id')
        .range(from, to)),
    supabase.from('hs_sector_packs').select('id, sector, name, description').order('name'),
    supabase.from('hs_sector_pack_items').select('id, pack_id, category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order').order('sort_order'),
  ]);

  const packs: (HsSectorPack & { items: HsSectorPackItem[] })[] = (packRows ?? []).map((p: HsSectorPack) => ({
    ...p,
    items: (packItemRows ?? []).filter((i: HsSectorPackItem) => i.pack_id === p.id),
  }));

  return (
    <RegisterClient
      companyId={params.companyId}
      canRecord
      items={items.rows}
      completions={completions.rows}
      files={files.rows}
      packs={packs}
      loadError={items.error ?? completions.error ?? files.error ?? (items.truncated ? 'Showing the first part of a very long register.' : null)}
    />
  );
}
