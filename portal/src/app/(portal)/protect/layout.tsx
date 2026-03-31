import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';

const TABS = [
  { href: '/protect/actions',    label: 'Actions' },
  { href: '/protect/compliance', label: 'Compliance' },
  { href: '/protect/reports',    label: 'Reports' },
];

export default async function ProtectLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let activeActions = 0;
  let overdueCompliance = 0;
  let pendingCompliance = 0;
  let reportsGenerated = 0;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    const companyId = (profile as any)?.company_id ?? '';

    if (companyId) {
      const now = new Date().toISOString();
      const [actRes, compOverdueRes, compPendingRes, repRes] = await Promise.all([
        supabase.from('actions').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('status', 'active')
          .or(`dismiss_until.is.null,dismiss_until.lt.${now}`),
        supabase.from('compliance_items').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('status', 'overdue'),
        supabase.from('compliance_items').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).in('status', ['pending', 'in_review']),
        supabase.from('reports').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId),
      ]);

      activeActions = actRes.count ?? 0;
      overdueCompliance = compOverdueRes.count ?? 0;
      pendingCompliance = compPendingRes.count ?? 0;
      reportsGenerated = repRes.count ?? 0;
    }
  }

  const stats = [
    { label: 'Active Actions',     value: activeActions,     color: 'var(--purple)' },
    { label: 'Overdue Compliance', value: overdueCompliance, color: '#DC2626' },
    { label: 'Pending Compliance', value: pendingCompliance, color: '#D97706' },
    { label: 'Reports',           value: reportsGenerated,  color: 'var(--teal)' },
  ];

  return (
    <>
      <Topbar title="PROTECT" subtitle="Actions, compliance and reporting" />

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
