import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';

const TABS = [
  { href: '/protect/actions',      label: 'Actions' },
  { href: '/protect/compliance',   label: 'Compliance' },
  { href: '/protect/offboarding',  label: 'Offboarding' },
  { href: '/protect/reports',      label: 'Reports' },
];

export default async function ProtectLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();

  let activeActions = 0;
  let overdueCompliance = 0;
  let pendingCompliance = 0;
  let reportsGenerated = 0;

  if (user && companyId) {
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

  const stats = [
    { label: 'Active Actions',     value: activeActions,     color: 'var(--purple)' },
    { label: 'Overdue Compliance', value: overdueCompliance, color: '#DC2626' },
    { label: 'Pending Compliance', value: pendingCompliance, color: '#D97706' },
    { label: 'Reports',           value: reportsGenerated,  color: 'var(--teal)' },
  ];

  return (
    <>
      <Topbar title="PROTECT" subtitle="Actions, compliance and reporting" />

      {/* Hero context */}
      <div className="px-5 lg:px-7 pt-4 pb-3">
        <div
          className="rounded-xl p-4"
          style={{
            background: overdueCompliance > 0
              ? 'rgba(239,68,68,0.04)'
              : 'var(--gradient-soft)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            {overdueCompliance > 0
              ? <><strong style={{ color: 'var(--danger)' }}>{overdueCompliance} overdue compliance item{overdueCompliance !== 1 ? 's' : ''}</strong> need{overdueCompliance === 1 ? 's' : ''} attention{pendingCompliance > 0 && <>, plus <strong>{pendingCompliance} pending</strong></>}. {activeActions > 0 && <>{activeActions} active action{activeActions !== 1 ? 's' : ''}.</>}</>
              : activeActions > 0
              ? <>You have <strong style={{ color: 'var(--purple)' }}>{activeActions} active action{activeActions !== 1 ? 's' : ''}</strong>{pendingCompliance > 0 && <> and <strong>{pendingCompliance} pending compliance item{pendingCompliance !== 1 ? 's' : ''}</strong></>}.</>
              : <span style={{ color: 'var(--success)' }}>Everything looks good. No overdue items or outstanding actions.</span>
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
