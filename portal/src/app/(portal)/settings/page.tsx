import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import {
  CompanyProfileForm,
  YourProfileForm,
  TeamMembers,
  NotificationPrefs,
} from '@/components/modules/SettingsForm';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = createServerSupabaseClient();
  const { user, profile, companyId } = await getSessionProfile();

  const [{ data: company }, { data: fullProfile }] = await Promise.all([
    supabase.from('companies').select('id, name, sector, size_band, contact_email').eq('id', companyId).single(),
    supabase.from('profiles').select('full_name').eq('id', user?.id ?? '').single(),
  ]);

  const p = fullProfile as any;

  // Fetch all profiles for the same company
  const { data: teamData } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('company_id', companyId)
    .order('role')
    .order('full_name');

  const teamMembers = (teamData ?? []) as {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  }[];

  return (
    <>
      <Topbar title="Settings" subtitle="Manage your account and company" />
      <main className="portal-page flex-1 max-w-[720px] space-y-6">

        {/* Company Profile */}
        <div className="card p-7">
          <p className="eyebrow mb-5">Company Profile</p>
          {company ? (
            <CompanyProfileForm company={company} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
              No company profile found.
            </p>
          )}
        </div>

        {/* Your Profile */}
        <div className="card p-7">
          <p className="eyebrow mb-5">Your Profile</p>
          <YourProfileForm
            profile={{ id: user?.id ?? '', full_name: p?.full_name ?? null }}
            email={user?.email ?? ''}
          />
        </div>

        {/* Team Members */}
        <div className="card p-7">
          <p className="eyebrow mb-5">Team Members</p>
          <TeamMembers members={teamMembers} currentUserId={user?.id ?? ''} />
        </div>

        {/* Notification Preferences */}
        <div className="card p-7">
          <p className="eyebrow mb-5">Notification Preferences</p>
          <NotificationPrefs />
        </div>

        {/* Password reset */}
        <div className="card p-7">
          <p className="eyebrow mb-2">Password</p>
          <p className="text-sm mb-4" style={{ color: 'var(--ink-faint)' }}>
            Use the link below to receive a password reset email.
          </p>
          <a href="/auth/reset-password" className="btn-secondary btn-sm">
            Send reset link
          </a>
        </div>

      </main>
    </>
  );
}
