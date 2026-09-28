import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import OrganisationsClient from './OrganisationsClient';
import { readAllPages } from '@/lib/supabase/paged';

export const metadata: Metadata = { title: 'Organisations & Access' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 1: the organisation model (type, parent), which
// consultancy serves which client, and who holds access to which
// organisation. Every write here goes through staff RLS or the
// grant/revoke RPCs, which re-check authority in the database and write
// the audit trail — this page is a view onto them, not a bypass.
export default async function OrganisationsPage() {
  const supabase = await createServerSupabaseClient();
  // Paged reads: a clipped list here would hide a grant someone holds.
  const [orgs, rels, grants, people] = await Promise.all([
    readAllPages<any>((from, to) => supabase.from('companies')
      .select('id, name, organisation_type, parent_organisation_id, active, archived_at')
      .order('name').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('organisation_relationships')
      .select('id, source_organisation_id, target_organisation_id, relationship_type, status, valid_from, valid_until')
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('user_organisation_access')
      .select('id, user_id, organisation_id, role_key, access_scope, valid_from, valid_until, active_status, revoked_at')
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('profiles')
      .select('id, full_name, email, company_id, role')
      .not('company_id', 'is', null).order('full_name').order('id').range(from, to)),
  ]);
  const error = orgs.error ?? rels.error ?? grants.error ?? people.error ?? null;

  return (
    <>
      <AdminTopbar title="Organisations & Access" subtitle="Consultancies, the clients they serve, and who can work in each organisation" />
      <main className="admin-page flex-1">
        {error && <div role="alert" className="card p-4 mb-4 text-sm" style={{ color: 'var(--red)' }}>Could not load everything: {error}</div>}
        <OrganisationsClient
          organisations={orgs.rows}
          relationships={rels.rows}
          grants={grants.rows}
          people={people.rows}
        />
      </main>
    </>
  );
}
