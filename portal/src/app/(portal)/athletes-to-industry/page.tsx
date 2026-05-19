import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Trophy, Building2 } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import AthletesPanel from './AthletesPanel';
import PartnersPanel from './PartnersPanel';
import TrainingPanel from './TrainingPanel';
import type {
  AthleteRow, InterestRow, PartnerRow, TrainingInterestRow, TrainingProviderRow,
} from './types';

export const metadata: Metadata = { title: 'Athletes To Industry' };
export const dynamic = 'force-dynamic';

export default async function AthletesToIndustryPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, featureFlags } = await getSessionProfile();
  if (!user) redirect('/auth/login');
  if (featureFlags?.athletes_to_industry === false) redirect('/dashboard');

  const [
    { data: athletesData },
    { data: partnersData },
    { data: providersData },
    { data: interestsData },
    { data: trainingInterestsData },
    { data: devPlansData },
  ] = await Promise.all([
    supabase
      .from('athletes')
      .select('id, company_id, full_name, email, phone, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, called_at, welcome_email_sent_at, created_at')
      .eq('company_id', companyId ?? '')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('partners')
      .select('id, company_name, locations, industry, website, logo_url, role_opportunities, active, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('training_providers')
      .select('id, provider_name, locations, category, website, logo_url, offerings, active, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('athlete_partner_interests')
      .select('id, athlete_id, partner_id, role_opportunity_id, status, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('athlete_training_interests')
      .select('id, athlete_id, provider_id, offering_id, status, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('dev_plans')
      .select('id, title, status, athlete_id')
      .eq('company_id', companyId ?? '')
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const athletes = (athletesData ?? []) as AthleteRow[];
  const partners = (partnersData ?? []) as PartnerRow[];
  const providers = (providersData ?? []) as TrainingProviderRow[];
  const interests = (interestsData ?? []) as InterestRow[];
  const trainingInterests = (trainingInterestsData ?? []) as TrainingInterestRow[];
  const devPlans = (devPlansData ?? []) as Array<{ id: string; title: string; status: string; athlete_id: string | null }>;

  return (
    <>
      <Topbar
        title="Athletes To Industry"
        subtitle="Athletes from your roster, programme partners and training providers — all in one place."
      />
      <main className="portal-page flex-1">
        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <AthletesPanel
            athletes={athletes}
            interests={interests}
            partners={partners}
            providers={providers}
            trainingInterests={trainingInterests}
            devPlans={devPlans}
          />
          <PartnersPanel
            partners={partners}
            interests={interests}
            athletes={athletes}
          />
        </div>

        <div className="mb-6">
          <TrainingPanel
            providers={providers}
            interests={trainingInterests}
            athletes={athletes}
          />
        </div>

        {athletes.length === 0 && partners.length === 0 && providers.length === 0 && (
          <div className="card p-10 text-center">
            <Trophy size={28} className="mx-auto mb-2" style={{ color: 'var(--ink-faint)' }} />
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
              Welcome to the Athletes To Industry programme
            </p>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--ink-soft)' }}>
              The People System will publish athletes, partners and training providers
              for the programme here. Sit tight while we get it set up — or get in touch
              to start building your roster.
            </p>
            <p className="text-[11px] mt-3 inline-flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
              <Building2 size={11} /> Programme info: <a href="https://www.athletestoindustry.co.uk" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--purple)' }}>athletestoindustry.co.uk</a>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
