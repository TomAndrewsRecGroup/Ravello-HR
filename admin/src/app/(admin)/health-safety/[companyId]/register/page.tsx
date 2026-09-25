import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsCompletion, HsFile, HsRegisterItem } from '@/lib/hs/types';
import RegisterClient from '@/components/hs/RegisterClient';

export const metadata: Metadata = { title: 'H&S register' };
export const dynamic = 'force-dynamic';

// The client's H&S register: statutory and recurring items, when each
// was last done, when it is next due, and the evidence.
export default async function HealthSafetyRegisterPage({ params }: { params: { companyId: string } }) {
  const supabase = createServerSupabaseClient();

  // All three in parallel and all paged: a register, its completions and
  // its files all grow without bound over the years a client is with us.
  const [items, completions, files] = await Promise.all([
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
  ]);

  return (
    <RegisterClient
      companyId={params.companyId}
      canRecord
      items={items.rows}
      completions={completions.rows}
      files={files.rows}
      loadError={items.error ?? completions.error ?? files.error ?? (items.truncated ? 'Showing the first part of a very long register.' : null)}
    />
  );
}
