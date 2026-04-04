import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';
import { Briefcase } from 'lucide-react';

const TABS = [
  { href: '/hire/hiring',        label: 'Hiring' },
  { href: '/hire/internal',      label: 'Internal Roles' },
  { href: '/hire/cost-modeller', label: 'Cost Modeller' },
  { href: '/hire/friction-lens', label: 'Friction Lens' },
  { href: '/hire/metrics',       label: 'Metrics' },
  { href: '/hire/benchmarks',    label: 'Benchmarks' },
];

export default async function HireLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let activeRoles = 0;
  let avgDaysOpen = 0;
  let pendingCandidates = 0;
  let rolesFilled = 0;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    const companyId = (profile as any)?.company_id ?? '';

    if (companyId) {
      const [reqRes, candRes] = await Promise.all([
        supabase.from('requisitions').select('id, stage, created_at').eq('company_id', companyId),
        supabase.from('candidates').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('approved_for_client', true).eq('client_status', 'pending'),
      ]);

      const reqs = reqRes.data ?? [];
      const active = reqs.filter((r: any) => !['filled', 'cancelled'].includes(r.stage));
      const filled = reqs.filter((r: any) => r.stage === 'filled');
      activeRoles = active.length;
      rolesFilled = filled.length;
      pendingCandidates = candRes.count ?? 0;

      if (active.length > 0) {
        const totalDays = active.reduce((s: number, r: any) =>
          s + Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000), 0);
        avgDaysOpen = Math.round(totalDays / active.length);
      }
    }
  }

  const stats = [
    { label: 'Active Roles',       value: activeRoles,        color: 'var(--purple)' },
    { label: 'Avg Days Open',      value: `${avgDaysOpen}d`,  color: 'var(--blue)' },
    { label: 'Candidates Pending', value: pendingCandidates,  color: '#D97706' },
    { label: 'Roles Filled',       value: rolesFilled,        color: 'var(--teal)' },
  ];

  return (
    <>
      <Topbar title="HIRE" subtitle="Recruitment, friction analysis and benchmarking" />

      {/* Hero context */}
      <div className="px-5 lg:px-7 pt-4 pb-3">
        <div className="rounded-xl p-4" style={{ background: 'var(--gradient-soft)' }}>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            {activeRoles > 0
              ? <>You have <strong style={{ color: 'var(--purple)' }}>{activeRoles} active role{activeRoles !== 1 ? 's' : ''}</strong>{avgDaysOpen > 0 && <> averaging <strong>{avgDaysOpen} days</strong> open</>}{pendingCandidates > 0 && <> with <strong style={{ color: 'var(--warning)' }}>{pendingCandidates} candidate{pendingCandidates !== 1 ? 's' : ''} awaiting review</strong></>}. {rolesFilled > 0 && <span style={{ color: 'var(--success)' }}>{rolesFilled} role{rolesFilled !== 1 ? 's' : ''} filled.</span>}</>
              : <span style={{ color: 'var(--ink-soft)' }}>No active roles right now. Raise a role to get started with recruitment.</span>
            }
          </p>
        </div>
      </div>

      {/* Tabs */}
      <SectionTabs tabs={TABS} />

      {/* Page content */}
      {children}
    </>
  );
}
