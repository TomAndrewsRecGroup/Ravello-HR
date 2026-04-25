import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import FrictionLensClient from './FrictionLensClient';
import type { CompanyAssessment } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'Friction Lens' };
export const revalidate = 60;

type CompanyInfo = {
  id: string;
  name: string | null;
  sector: string | null;
  contact_email: string | null;
  ivylens_company_id: string | null;
} | null;

export default async function FrictionLensPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) redirect('/auth/login');

  // Parallel: company info (for the IvyLens registration call) + latest assessment.
  // Both are fed into the client as initial props so the form skips the post-mount
  // round-trips it used to do (auth → profiles → companies → /api/company/results).
  const [companyRes, assessmentRes] = await Promise.all([
    companyId
      ? supabase
          .from('companies')
          .select('id, name, sector, contact_email, ivylens_company_id')
          .eq('id', companyId)
          .single()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase
          .from('company_assessments')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <FrictionLensClient
      initialAssessment={(assessmentRes.data ?? null) as CompanyAssessment | null}
      company={(companyRes.data ?? null) as CompanyInfo}
    />
  );
}
