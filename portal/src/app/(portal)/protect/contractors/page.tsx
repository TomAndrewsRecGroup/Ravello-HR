import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { Contractor, ContractorInsurance } from '@/lib/hs/types';
import ContractorsClient from '@/components/hs/ContractorsClient';

export const metadata: Metadata = { title: 'Contractors' };
export const dynamic = 'force-dynamic';

// A contractor company the client works with (150), the same table
// admin's own /health-safety/<companyId>/contractors uses — RLS
// (`contractors_manage`) already grants a client_admin session full
// read/write access here via `contractors.manage`, which
// `organisation_admin` (client_admin's mapped catalogue role, 117)
// holds automatically for their own organisation. This page reuses the
// SAME ContractorsClient component admin renders, verbatim, since
// nothing about it is admin-specific (it already takes companyId as a
// prop, never a route param).
export default async function ProtectContractorsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [contractors, insurances] = await Promise.all([
    readAllPages<Contractor>((from, to) =>
      supabase.from('contractors')
        .select('id, company_id, name, registration_number, contact_name, contact_email, contact_phone, approval_status, risk_rating, notes, created_by, created_at, updated_at')
        .eq('company_id', companyId)
        .order('name').order('id')
        .range(from, to)),
    readAllPages<ContractorInsurance>((from, to) =>
      supabase.from('contractor_insurances')
        .select('id, contractor_id, company_id, insurance_type, provider, policy_number, cover_amount, expires_on, notes, created_at, updated_at')
        .eq('company_id', companyId)
        .order('expires_on').order('id')
        .range(from, to)),
  ]);

  return (
    <main className="portal-page flex-1">
      <ContractorsClient
        companyId={companyId}
        contractors={contractors.rows}
        insurances={insurances.rows}
        loadError={contractors.error ?? insurances.error ?? (contractors.truncated || insurances.truncated ? 'Showing the first part of a long list.' : null)}
        role="portal"
      />
    </main>
  );
}
