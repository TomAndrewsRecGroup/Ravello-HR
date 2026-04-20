import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BDRolesClient from './BDRolesClient';
import { Radar } from 'lucide-react';
import { ivylensRequest } from '@/lib/ivylens';

export const metadata: Metadata = { title: 'BD Roles' };
export const revalidate = 60;

export interface FlatRole {
  id:            string;
  company_name:  string;
  company_id:    string | null;     // null for ivylens-only companies
  company_source: 'local' | 'ivylens';
  role_title:    string | null;
  salary_text:   string | null;
  salary_min:    number | null;
  salary_max:    number | null;
  location:      string | null;
  working_model: string | null;
  source_board:  string | null;
  source_url:    string | null;
  scanned_at:    string | null;
  still_active:  boolean;
}

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

export default async function BDRolesPage() {
  const supabase = createServerSupabaseClient();

  const [localRolesRes, bdCompaniesRes, ivylensRes] = await Promise.all([
    supabase.from('bd_scanned_roles').select('*').order('scanned_at', { ascending: false }),
    supabase.from('bd_companies').select('id,company_name'),
    ivylensRequest<{ leads?: any[] }>('/bd/leads').catch(() => ({ data: null, error: 'unavailable', status: 0 })),
  ]);

  const localRoles  = localRolesRes.data ?? [];
  const bdCompanies = bdCompaniesRes.data ?? [];
  const companyById = new Map(bdCompanies.map((c: any) => [c.id, c.company_name]));

  const ivylensLeads = (ivylensRes as any)?.data?.leads ?? [];

  // Flatten local roles
  const local: FlatRole[] = localRoles.map((r: any) => ({
    id:             r.id,
    company_name:   companyById.get(r.company_id) ?? '—',
    company_id:     r.company_id,
    company_source: 'local',
    role_title:     r.role_title ?? null,
    salary_text:    r.salary_text ?? null,
    salary_min:     r.salary_min ?? null,
    salary_max:     r.salary_max ?? null,
    location:       r.location ?? null,
    working_model:  r.working_model ?? null,
    source_board:   r.source_board ?? null,
    source_url:     r.source_url ?? null,
    scanned_at:     r.scanned_at ?? null,
    still_active:   r.still_active ?? true,
  }));

  // Flatten IvyLens leads' roles
  const ivylensFlat: FlatRole[] = ivylensLeads.flatMap((lead: any) =>
    (lead.roles ?? []).map((r: any, idx: number) => {
      const { min, max } = parseSalary(r.salary);
      return {
        id:             `ivylens-${lead.id ?? lead.company_name}-${idx}`,
        company_name:   lead.company_name ?? '—',
        company_id:     null,
        company_source: 'ivylens' as const,
        role_title:     r.title ?? null,
        salary_text:    r.salary ?? null,
        salary_min:     min,
        salary_max:     max,
        location:       r.location ?? lead.company_location ?? null,
        working_model:  null,
        source_board:   r.source ?? null,
        source_url:     r.url ?? null,
        scanned_at:     lead.sent_at ?? null,
        still_active:   true,
      };
    })
  );

  const allRoles = [...ivylensFlat, ...local];

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;

  const stats = {
    total:        allRoles.length,
    active:       allRoles.filter(r => r.still_active).length,
    fromIvylens:  ivylensFlat.length,
    newThisWeek:  allRoles.filter(r => r.scanned_at && new Date(r.scanned_at).getTime() > sevenDaysAgo).length,
  };

  return (
    <>
      <AdminTopbar
        title="BD Roles"
        subtitle="Flat feed of every role sourced from IvyLens and local BD scanning"
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold"
            style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}>
            <Radar size={13} /> {stats.fromIvylens} from IvyLens
          </div>
        }
      />
      <main className="admin-page flex-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="stat-card">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Total Roles</p>
            <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--ink)' }}>{stats.total}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Active</p>
            <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--ink)' }}>{stats.active}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>From IvyLens</p>
            <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--purple)' }}>{stats.fromIvylens}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>New This Week</p>
            <p className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--ink)' }}>{stats.newThisWeek}</p>
          </div>
        </div>

        <BDRolesClient roles={allRoles} />
      </main>
    </>
  );
}
