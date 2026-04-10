import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BDIntelligenceClient from './BDIntelligenceClient';
import { Target } from 'lucide-react';
import { ivylensRequest } from '@/lib/ivylens';

export const metadata: Metadata = { title: 'BD Intelligence' };
export const revalidate = 60;

export default async function BDIntelligencePage() {
  const supabase = createServerSupabaseClient();

  const [companiesRes, rolesRes, ivylensRes] = await Promise.all([
    supabase.from('bd_companies').select('*').order('last_seen_at', { ascending: false }),
    supabase.from('bd_scanned_roles').select('*').order('scanned_at', { ascending: false }),
    ivylensRequest('/bd/companies').catch(() => ({ data: null, error: 'unavailable', status: 0 })),
  ]);

  const companies: any[] = companiesRes.data ?? [];
  const roles: any[]     = rolesRes.data ?? [];
  const ivylensCompanies: any[] = (ivylensRes as any)?.data?.companies ?? [];

  // Merge IvyLens BD data — add any companies not already tracked locally
  const localNames = new Set(companies.map((c: any) => c.company_name?.toLowerCase()));
  const mergedFromIvylens = ivylensCompanies.filter(
    (ic: any) => ic.company_name && !localNames.has(ic.company_name.toLowerCase())
  ).map((ic: any) => ({
    ...ic,
    id: `ivylens-${ic.id ?? ic.company_name}`,
    source: 'ivylens',
    status: ic.status ?? 'prospect',
    total_roles_seen: ic.roles_count ?? ic.total_roles_seen ?? 0,
    last_seen_at: ic.last_seen_at ?? ic.updated_at ?? new Date().toISOString(),
    first_seen_at: ic.first_seen_at ?? ic.created_at ?? new Date().toISOString(),
  }));

  const allCompanies = [...companies, ...mergedFromIvylens];

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const totalCompanies    = allCompanies.length;
  const totalActiveRoles  = roles.filter((r: any) => r.still_active).length;
  const newThisWeek       = allCompanies.filter((c: any) => c.first_seen_at && new Date(c.first_seen_at) > sevenDaysAgo).length;
  const highVolume        = allCompanies.filter((c: any) => (c.total_roles_seen ?? 0) >= 5).length;
  const ivylensCount      = mergedFromIvylens.length;

  const stats = [
    { label: 'Companies Tracked', value: totalCompanies },
    { label: 'Active Roles',       value: totalActiveRoles },
    { label: 'New This Week',      value: newThisWeek },
    { label: ivylensCount > 0 ? 'IvyLens Sourced' : 'High-Volume Prospects', value: ivylensCount > 0 ? ivylensCount : highVolume },
  ];

  return (
    <>
      <AdminTopbar
        title="BD Intelligence"
        subtitle="Companies and roles identified through market scanning"
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold"
            style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
            <Target size={13} /> Live Data
          </div>
        }
      />
      <main className="admin-page flex-1">

        {/* Stats bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="stat-card">
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
              <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--ink)' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Client-side interactive table + modal */}
        <BDIntelligenceClient companies={allCompanies} roles={roles} />
      </main>
    </>
  );
}
