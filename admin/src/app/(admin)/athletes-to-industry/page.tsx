import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import PartnersClient from './PartnersClient';
import AthletesClient from './AthletesClient';
import type { AthleteRow, InterestRow, PartnerRow } from './types';

export const metadata: Metadata = { title: 'Athletes To Industry' };
export const dynamic = 'force-dynamic';

interface CompanyRow { id: string; name: string }

export default async function AthletesToIndustryAdminPage() {
  const supabase = createServerSupabaseClient();

  const [partnersRes, athletesRes, interestsRes, companiesRes] = await Promise.all([
    supabase
      .from('partners')
      .select('id, company_name, locations, industry, website, role_opportunities, active, created_at')
      .order('active', { ascending: false })
      .order('company_name', { ascending: true }),
    supabase
      .from('athletes')
      .select('id, company_id, full_name, email, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, created_at, companies(name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('athlete_partner_interests')
      .select('id, athlete_id, partner_id, role_opportunity_id, status, notes, created_at'),
    supabase
      .from('companies')
      .select('id, name')
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  const partners = (partnersRes.data ?? []) as PartnerRow[];
  const interests = (interestsRes.data ?? []) as InterestRow[];
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
        subtitle="Manage the partner pool and review athletes added across all clients."
      />
      <main className="admin-page flex-1 space-y-8">
        <PartnersClient
          initial={partners}
          interests={interests}
        />
        <AthletesClient
          initial={athletes}
          partners={partners.filter(p => p.active)}
          interests={interests}
          companies={companies}
        />
      </main>
    </>
  );
}
