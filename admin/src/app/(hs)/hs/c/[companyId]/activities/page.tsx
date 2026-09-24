import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { canWrite, myGrant } from '@/lib/hs/access';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsActivity, HsFile } from '@/lib/hs/types';
import ActivitiesClient from '@/components/hs/ActivitiesClient';

export const metadata: Metadata = { title: 'H&S activities' };
export const dynamic = 'force-dynamic';

// Logged events: site visits, advice calls, fire drills, SSIP
// submissions, inspections. Insert-only (095): a correction is a new entry.
export default async function HsActivitiesPage({ params }: { params: { companyId: string } }) {
  const supabase = createServerSupabaseClient();
  const grant = await myGrant(supabase, params.companyId);
  if (!grant || !grant.scopes.includes('register')) notFound();

  const [{ data: activities, error }, files] = await Promise.all([
    supabase.from('hs_activities')
      .select('id, company_id, activity_type, title, occurred_on, summary, recorded_by_kind, created_at')
      .eq('company_id', params.companyId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    readAllPages<HsFile>((from, to) =>
      supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', params.companyId)
        .eq('entity_type', 'activity')
        .order('created_at', { ascending: false }).order('id')
        .range(from, to)),
  ]);

  return (
    <ActivitiesClient
      companyId={params.companyId}
      canRecord={canWrite(grant, 'register')}
      activities={(activities ?? []) as HsActivity[]}
      files={files.rows}
      loadError={error?.message ?? files.error ?? null}
    />
  );
}
