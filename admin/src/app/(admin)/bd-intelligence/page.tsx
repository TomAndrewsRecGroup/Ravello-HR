import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BDIntelligenceClient from './BDIntelligenceClient';
import { Target } from 'lucide-react';
import { ivylensRequest } from '@/lib/ivylens';

export const metadata: Metadata = { title: 'BD Intelligence' };
export const runtime    = 'edge';
export const revalidate = 60;

export default async function BDIntelligencePage() {
  const supabase = createServerSupabaseClient();

  const [companiesRes, rolesRes, ivylensRes] = await Promise.all([
    supabase.from('bd_companies').select('*').order('last_seen_at', { ascending: false }),
    supabase.from('bd_scanned_roles').select('*').order('scanned_at', { ascending: false }),
    ivylensRequest('/bd/leads').catch(() => ({ data: null, error: 'unavailable', status: 0 })),
  ]);

  const companies: any[] = companiesRes.data ?? [];
  const roles: any[]     = rolesRes.data ?? [];
  const ivylensLeads: any[] = (ivylensRes as any)?.data?.leads ?? [];

  // Parse IvyLens salary strings like "65000-80000" or "£65k-£80k"
  function parseSalary(s: string | null | undefined): { min: number | null; max: number | null } {
    if (!s) return { min: null, max: null };
    const nums = s.replace(/[£,]/g, '').match(/(\d+)(k)?/gi) ?? [];
    const parsed = nums.map(n => {
      const hasK = /k$/i.test(n);
      const val = parseInt(n.replace(/k$/i, ''), 10);
      return hasK ? val * 1000 : val;
    }).filter(n => !isNaN(n) && n > 0);
    if (parsed.length === 0) return { min: null, max: null };
    if (parsed.length === 1) return { min: parsed[0], max: parsed[0] };
    return { min: Math.min(...parsed), max: Math.max(...parsed) };
  }

  // Merge IvyLens BD leads — add any companies not already tracked locally
  const localNames = new Set(companies.map((c: any) => c.company_name?.toLowerCase()));
  const mergedFromIvylens = ivylensLeads
    .filter((l: any) => l.company_name && !localNames.has(l.company_name.toLowerCase()))
    .map((l: any) => ({
      id: `ivylens-${l.id ?? l.company_name}`,
      company_name: l.company_name,
      company_location: l.company_location ?? null,
      source: 'ivylens',
      status: 'Prospect',
      total_roles_seen: (l.roles ?? []).length,
      last_seen_at: l.sent_at ?? new Date().toISOString(),
      first_seen_at: l.sent_at ?? new Date().toISOString(),
      ivylens_roles: l.roles ?? [],
      friction_intel: l.friction_intel ?? null,
    }));

  // Synthesize scanned-role rows for IvyLens leads so the existing table view renders them
  const ivylensRoleRows: any[] = ivylensLeads.flatMap((l: any) => {
    const companyId = `ivylens-${l.id ?? l.company_name}`;
    return (l.roles ?? []).map((r: any, idx: number) => {
      const { min, max } = parseSalary(r.salary);
      return {
        id:            `${companyId}-role-${idx}`,
        company_id:    companyId,
        role_title:    r.title ?? null,
        salary_min:    min,
        salary_max:    max,
        salary_text:   r.salary ?? null,
        location:      r.location ?? null,
        working_model: null,
        source_url:    r.url ?? null,
        source_board:  r.source ?? null,
        scanned_at:    l.sent_at ?? null,
        still_active:  true,
      };
    });
  });

  const allCompanies = [...companies, ...mergedFromIvylens];
  const allRoles     = [...roles, ...ivylensRoleRows];

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const totalCompanies    = allCompanies.length;
  const totalActiveRoles  = allRoles.filter((r: any) => r.still_active).length;
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
        <BDIntelligenceClient companies={allCompanies} roles={allRoles} />
      </main>
    </>
  );
}
