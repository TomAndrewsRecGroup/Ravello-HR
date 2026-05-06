import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import PartnersClient from './PartnersClient';
import TrainingProvidersClient from './TrainingProvidersClient';
import AthletesClient from './AthletesClient';
import type {
  AthleteRow, InterestRow, PartnerRow, TrainingInterestRow, TrainingProviderRow,
} from './types';

export const metadata: Metadata = { title: 'Athletes To Industry' };
export const dynamic = 'force-dynamic';

interface CompanyRow { id: string; name: string }

export default async function AthletesToIndustryAdminPage() {
  const supabase = createServerSupabaseClient();

  const [
    partnersRes, providersRes, athletesRes, interestsRes, trainingInterestsRes, companiesRes,
  ] = await Promise.all([
    supabase
      .from('partners')
      .select('id, company_name, locations, industry, website, logo_url, role_opportunities, active, created_at')
      .order('active', { ascending: false })
      .order('company_name', { ascending: true }),
    supabase
      .from('training_providers')
      .select('id, provider_name, locations, category, website, logo_url, offerings, active, created_at')
      .order('active', { ascending: false })
      .order('provider_name', { ascending: true }),
    supabase
      .from('athletes')
      .select('id, company_id, full_name, email, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, created_at, companies(name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('athlete_partner_interests')
      .select('id, athlete_id, partner_id, role_opportunity_id, status, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('athlete_training_interests')
      .select('id, athlete_id, provider_id, offering_id, status, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('companies')
      .select('id, name')
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  const partners = (partnersRes.data ?? []) as PartnerRow[];
  const providers = (providersRes.data ?? []) as TrainingProviderRow[];
  const interests = (interestsRes.data ?? []) as InterestRow[];
  const trainingInterests = (trainingInterestsRes.data ?? []) as TrainingInterestRow[];
  const companies = (companiesRes.data ?? []) as CompanyRow[];

  type RawAthlete = Omit<AthleteRow, 'company_name'> & {
    companies?: { name: string } | { name: string }[] | null;
  };
  const athletes: AthleteRow[] = ((athletesRes.data ?? []) as unknown as RawAthlete[])
    .map(a => {
      const c = Array.isArray(a.companies) ? a.companies[0] : a.companies;
      return { ...a, company_name: c?.name ?? null };
    });

  return (
    <>
      <AdminTopbar
        title="Athletes To Industry"
        subtitle="Manage the partner pool, training providers and review athletes added across all clients."
      />
      <main className="admin-page flex-1 space-y-8">
        <PartnersClient
          initial={partners}
          interests={interests}
          athletes={athletes}
        />
        <TrainingProvidersClient
          initial={providers}
          interests={trainingInterests}
          athletes={athletes}
        />
        <AthletesClient
          initial={athletes}
          partners={partners.filter(p => p.active)}
          providers={providers.filter(p => p.active)}
          interests={interests}
          trainingInterests={trainingInterests}
          companies={companies}
        />
      </main>
    </>
  );
}
