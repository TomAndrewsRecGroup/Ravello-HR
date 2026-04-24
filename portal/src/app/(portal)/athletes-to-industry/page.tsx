import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Trophy, Building2 } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import AthletesPanel from './AthletesPanel';
import PartnersPanel from './PartnersPanel';
import type { AthleteRow, InterestRow, PartnerRow } from './types';

export const metadata: Metadata = { title: 'Athletes To Industry' };
export const dynamic = 'force-dynamic';

export default async function AthletesToIndustryPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, featureFlags } = await getSessionProfile();
  if (!user) redirect('/auth/login');
  if (featureFlags?.athletes_to_industry === false) redirect('/dashboard');

  const [{ data: athletesData }, { data: partnersData }, { data: interestsData }] =
    await Promise.all([
      supabase
        .from('athletes')
        .select('id, company_id, full_name, email, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, created_at')
        .eq('company_id', companyId ?? '')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('partners')
        .select('id, company_name, locations, industry, website, role_opportunities, active, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('athlete_partner_interests')
        .select('id, athlete_id, partner_id, role_opportunity_id, status, notes, created_at'),
    ]);

  const athletes = (athletesData ?? []) as AthleteRow[];
  const partners = (partnersData ?? []) as PartnerRow[];
  const interests = (interestsData ?? []) as InterestRow[];

  return (
    <>
      <Topbar
        title="Athletes To Industry"
        subtitle="Match athletes from your roster to live partner roles."
      />
      <main className="portal-page flex-1">
        <div className="grid lg:grid-cols-2 gap-5 mb-6">
          <AthletesPanel
            athletes={athletes}
            partners={partners}
            interests={interests}
          />
          <PartnersPanel
            partners={partners}
            interests={interests}
          />
        </div>

        {athletes.length === 0 && partners.length === 0 && (
          <div className="card p-10 text-center">
            <Trophy size={28} className="mx-auto mb-2" style={{ color: 'var(--ink-faint)' }} />
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
              Welcome to the Athletes To Industry programme
            </p>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--ink-soft)' }}>
              Add your first athlete on the left, or wait for partners to start
              listing roles on the right. Once both lists have content you can
              match athletes to partner roles in a few clicks.
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
