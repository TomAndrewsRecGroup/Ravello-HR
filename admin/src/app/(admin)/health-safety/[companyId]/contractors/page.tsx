import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { Contractor, ContractorInsurance } from '@/lib/hs/types';
import ContractorsClient from '@/components/hs/ContractorsClient';

export const metadata: Metadata = { title: 'H&S contractors' };
export const dynamic = 'force-dynamic';

// Contractor companies, prequalification and insurance (150). A
// contractor is distinct from a contractor WORKER (151, a `people` row)
// — this page is the company record they work for.
export default async function HealthSafetyContractorsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [contractors, insurances] = await Promise.all([
    readAllPages<Contractor>((from, to) =>
      supabase.from('contractors')
        .select('id, company_id, name, registration_number, contact_name, contact_email, contact_phone, approval_status, risk_rating, notes, created_by, created_at, updated_at')
        .eq('company_id', params.companyId)
        .order('name').order('id')
        .range(from, to)),
    readAllPages<ContractorInsurance>((from, to) =>
      supabase.from('contractor_insurances')
        .select('id, contractor_id, company_id, insurance_type, provider, policy_number, cover_amount, expires_on, notes, created_at, updated_at')
        .eq('company_id', params.companyId)
        .order('expires_on').order('id')
        .range(from, to)),
  ]);

  return (
    <ContractorsClient
      companyId={params.companyId}
      contractors={contractors.rows}
      insurances={insurances.rows}
      loadError={contractors.error ?? insurances.error ?? (contractors.truncated || insurances.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
