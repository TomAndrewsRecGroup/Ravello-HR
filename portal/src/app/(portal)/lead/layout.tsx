import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import GroupedTabs from '@/components/layout/GroupedTabs';

const TAB_GROUPS = [
  {
    label: 'People',
    tabs: [
      { href: '/lead/employee-records', label: 'Employees' },
      { href: '/lead/org-chart',        label: 'Org Chart' },
      { href: '/lead/onboarding',       label: 'Onboarding' },
    ],
  },
  {
    label: 'Docs',
    tabs: [
      { href: '/lead/documents',              label: 'Documents' },
      { href: '/lead/policy-acknowledgements', label: 'Sign-off' },
    ],
  },
  {
    label: 'Develop',
    tabs: [
      { href: '/lead/learning',   label: 'Learning' },
      { href: '/lead/hr-reports', label: 'Reports' },
    ],
  },
];

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let totalDocs = 0;
  let milestones = 0;
  let openTraining = 0;
  let purchasedCourses = 0;
  let activeEmployees = 0;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    const companyId = (profile as any)?.company_id ?? '';

    if (companyId) {
      const [docRes, mileRes, trainRes, purchRes, empRes] = await Promise.all([
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('milestones').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('training_needs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'open'),
        supabase.from('learning_purchases').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
        supabase.from('employee_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
      ]);

      totalDocs = docRes.count ?? 0;
      milestones = mileRes.count ?? 0;
      openTraining = trainRes.count ?? 0;
      purchasedCourses = purchRes.count ?? 0;
      activeEmployees = empRes.count ?? 0;
    }
  }

  const stats = [
    { label: 'Employees',       value: activeEmployees,  color: '#14B8A6' },
    { label: 'Documents',       value: totalDocs,        color: 'var(--blue)' },
    { label: 'Open Training',   value: openTraining,     color: '#D97706' },
    { label: 'Courses Active',  value: purchasedCourses, color: 'var(--teal)' },
  ];

  return (
    <>
      <Topbar title="LEAD" subtitle="People, documents and development" />

      {/* Hero context */}
      <div className="px-5 lg:px-7 pt-4 pb-3">
        <div className="rounded-xl p-4" style={{ background: 'var(--gradient-soft)' }}>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            {activeEmployees > 0
              ? <>You have <strong style={{ color: 'var(--purple)' }}>{activeEmployees} employee{activeEmployees !== 1 ? 's' : ''}</strong>{totalDocs > 0 && <>, <strong>{totalDocs} document{totalDocs !== 1 ? 's' : ''}</strong></>}{openTraining > 0 && <>, and <strong style={{ color: 'var(--warning)' }}>{openTraining} open training need{openTraining !== 1 ? 's' : ''}</strong></>}.</>
              : <span style={{ color: 'var(--ink-soft)' }}>Add your first employee record to start building your people directory.</span>
            }
          </p>
        </div>
      </div>

      {/* Grouped tabs */}
      <GroupedTabs groups={TAB_GROUPS} />

      {/* Page content */}
      {children}
    </>
  );
}
