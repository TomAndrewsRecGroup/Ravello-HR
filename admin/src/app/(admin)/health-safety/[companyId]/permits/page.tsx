import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { Permit, PermitPerson, PermitTemplate } from '@/lib/hs/types';
import PermitsClient from '@/components/hs/PermitsClient';

export const metadata: Metadata = { title: 'H&S permits to work' };
export const dynamic = 'force-dynamic';

interface PickRow { id: string; name?: string; full_name?: string; title?: string }

// Permit to work (152): templates, permits and the people each permit
// covers. Lifecycle (draft -> issued -> suspended -> closed/revoked) is
// enforced by permits_lifecycle_guard() — this page only ever attempts
// the status UPDATE and surfaces whatever the trigger refuses.
export default async function HealthSafetyPermitsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [templates, permits, permitPeople, sites, equipment, people, authTypes] = await Promise.all([
    readAllPages<PermitTemplate>((from, to) =>
      supabase.from('permit_templates')
        .select('id, company_id, name, permit_type, description, required_authorisation_type_id, default_validity_hours, active, created_by, created_at, updated_at')
        .eq('company_id', params.companyId).order('name').order('id').range(from, to)),
    readAllPages<Permit>((from, to) =>
      supabase.from('permits')
        .select('id, company_id, permit_number, template_id, site_id, asset_id, scope_of_work, status, issued_by, issued_at, authorised_person_id, valid_from, valid_until, suspended_at, suspended_by, suspended_reason, revalidated_at, revalidated_by, closed_at, closed_by, closeout_notes, revoked_at, revoked_by, revoked_reason, created_by, created_at, updated_at')
        .eq('company_id', params.companyId).order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<PermitPerson>((from, to) =>
      supabase.from('permit_people')
        .select('id, permit_id, company_id, person_id, added_at')
        .eq('company_id', params.companyId).order('added_at').order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('hs_sites').select('id, name').eq('company_id', params.companyId).eq('active', true).order('name').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('hs_equipment').select('id, name').eq('company_id', params.companyId).order('name').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('people').select('id, full_name').eq('company_id', params.companyId).order('full_name').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('authorisation_types').select('id, title').eq('company_id', params.companyId).order('title').range(from, to)),
  ]);

  const loadError = [templates, permits, permitPeople, sites, equipment, people, authTypes]
    .map(r => r.error).find(Boolean) ?? null;

  return (
    <PermitsClient
      companyId={params.companyId}
      templates={templates.rows}
      permits={permits.rows}
      permitPeople={permitPeople.rows}
      sites={sites.rows.map(r => ({ id: r.id, name: r.name ?? '' }))}
      equipment={equipment.rows.map(r => ({ id: r.id, name: r.name ?? '' }))}
      people={people.rows.map(r => ({ id: r.id, name: r.full_name ?? '' }))}
      authorisationTypes={authTypes.rows.map(r => ({ id: r.id, title: r.title ?? '' }))}
      loadError={loadError}
    />
  );
}
