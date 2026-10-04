import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { Isolation, IsolationLock } from '@/lib/hs/types';
import IsolationsClient from '@/components/hs/IsolationsClient';

export const metadata: Metadata = { title: 'H&S isolations (LOTO)' };
export const dynamic = 'force-dynamic';

interface PickRow { id: string; name?: string }
interface PersonRow { id: string; full_name: string }

// Isolation / lockout-tag-out (153): applied -> verified -> removed,
// with a personal lock per worker on each isolation. The lifecycle and
// the "every lock cleared by its own owner" rule are enforced by
// isolations_lifecycle_guard() / isolation_locks_guard() — this page
// only ever attempts the UPDATE and shows whatever the trigger refuses.
export default async function HealthSafetyIsolationsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [isolations, locks, equipment, people] = await Promise.all([
    readAllPages<Isolation>((from, to) =>
      supabase.from('isolations')
        .select('id, company_id, asset_id, permit_id, isolation_type, description, status, applied_by, applied_at, verified_by, verified_at, removed_by, removed_at, removal_verified_by, removal_verified_at, created_by, created_at, updated_at')
        .eq('company_id', params.companyId).order('applied_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<IsolationLock>((from, to) =>
      supabase.from('isolation_locks')
        .select('id, isolation_id, company_id, person_id, lock_number, applied_at, removed_at, removed_by, override_reason, override_authorised_by')
        .eq('company_id', params.companyId).order('applied_at').order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('hs_equipment').select('id, name').eq('company_id', params.companyId).order('name').order('id').range(from, to)),
    readAllPages<PersonRow>((from, to) =>
      supabase.from('people').select('id, full_name').eq('company_id', params.companyId).order('full_name').order('id').range(from, to)),
  ]);

  const loadError = [isolations, locks, equipment, people].map(r => r.error).find(Boolean) ?? null;

  return (
    <IsolationsClient
      companyId={params.companyId}
      isolations={isolations.rows}
      locks={locks.rows}
      equipment={equipment.rows.map(r => ({ id: r.id, name: r.name ?? '' }))}
      people={people.rows.map(r => ({ id: r.id, name: r.full_name ?? '' }))}
      loadError={loadError}
      role="admin"
    />
  );
}
