import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';
import { Briefcase } from 'lucide-react';

const TABS = [
  { href: '/hire/hiring',        label: 'Hiring' },
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

      {/* Mini metrics row */}
      <div className="px-6 pt-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(s => (
            <div
              key={s.label}
              className="rounded-[10px] px-4 py-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            >
              <p className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
              <p className="font-display font-bold text-xl" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <SectionTabs tabs={TABS} />

      {/* Page content */}
      {children}
    </>
  );
}
