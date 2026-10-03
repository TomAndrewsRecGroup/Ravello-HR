import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { Permit, PermitChecklistResponse, PermitPerson, PermitTemplate, PermitTemplateItem } from '@/lib/hs/types';
import PermitsClient from '@/components/hs/PermitsClient';

export const metadata: Metadata = { title: 'Permits to work' };
export const dynamic = 'force-dynamic';

interface PickRow { id: string; name?: string; full_name?: string; title?: string }

// Permit to work (152): templates, permits, the people each permit
// covers, and the checklist a person on site works through. Same
// component and RLS as admin's own permits tab — a client_admin
// session already holds `contractors.manage` for their own
// organisation, and the lifecycle guard (permits_lifecycle_guard())
// enforces the workflow regardless of which app the write comes from.
export default async function ProtectPermitsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [templates, permits, permitPeople, sites, equipment, people, authTypes] = await Promise.all([
    readAllPages<PermitTemplate>((from, to) =>
      supabase.from('permit_templates')
        .select('id, company_id, name, permit_type, description, required_authorisation_type_id, default_validity_hours, active, created_by, created_at, updated_at')
        .eq('company_id', companyId).order('name').order('id').range(from, to)),
    readAllPages<Permit>((from, to) =>
      supabase.from('permits')
        .select('id, company_id, permit_number, template_id, site_id, asset_id, scope_of_work, status, issued_by, issued_at, authorised_person_id, valid_from, valid_until, suspended_at, suspended_by, suspended_reason, revalidated_at, revalidated_by, closed_at, closed_by, closeout_notes, revoked_at, revoked_by, revoked_reason, created_by, created_at, updated_at')
        .eq('company_id', companyId).order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<PermitPerson>((from, to) =>
      supabase.from('permit_people')
        .select('id, permit_id, company_id, person_id, added_at')
        .eq('company_id', companyId).order('added_at').order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('hs_sites').select('id, name').eq('company_id', companyId).eq('active', true).order('name').order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('hs_equipment').select('id, name').eq('company_id', companyId).order('name').order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('people').select('id, full_name').eq('company_id', companyId).order('full_name').order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('authorisation_types').select('id, title').eq('company_id', companyId).order('title').order('id').range(from, to)),
  ]);

  const templateIds = templates.rows.map(t => t.id);
  const [templateItems, checklistResponses] = await Promise.all([
    templateIds.length > 0
      ? readAllPages<PermitTemplateItem>((from, to) =>
          supabase.from('permit_template_items')
            .select('id, template_id, prompt, guidance, sort_order')
            .in('template_id', templateIds).order('sort_order').order('id').range(from, to))
      : Promise.resolve({ rows: [] as PermitTemplateItem[], error: null, truncated: false }),
    readAllPages<PermitChecklistResponse>((from, to) =>
      supabase.from('permit_checklist_responses')
        .select('id, permit_id, company_id, template_item_id, prompt, rating, comment, sort_order, created_at')
        .eq('company_id', companyId).order('sort_order').order('id').range(from, to)),
  ]);

  const loadError = [templates, permits, permitPeople, sites, equipment, people, authTypes, templateItems, checklistResponses]
    .map(r => r.error).find(Boolean) ?? null;

  return (
    <main className="portal-page flex-1">
      <PermitsClient
        companyId={companyId}
        templates={templates.rows}
        templateItems={templateItems.rows}
        permits={permits.rows}
        permitPeople={permitPeople.rows}
        checklistResponses={checklistResponses.rows}
        sites={sites.rows.map(r => ({ id: r.id, name: r.name ?? '' }))}
        equipment={equipment.rows.map(r => ({ id: r.id, name: r.name ?? '' }))}
        people={people.rows.map(r => ({ id: r.id, name: r.full_name ?? '' }))}
        authorisationTypes={authTypes.rows.map(r => ({ id: r.id, title: r.title ?? '' }))}
        loadError={loadError}
        role="portal"
      />
    </main>
  );
}
