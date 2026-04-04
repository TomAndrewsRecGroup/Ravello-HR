import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import SectionTabs from '@/components/layout/SectionTabs';

const TABS = [
  { href: '/lead/employee-records',       label: 'Employee Records' },
  { href: '/lead/onboarding',             label: 'Onboarding' },
  { href: '/lead/org-chart',              label: 'Org Chart' },
  { href: '/lead/policy-acknowledgements', label: 'Policy Sign-off' },
  { href: '/lead/hr-reports',             label: 'HR Reports' },
  { href: '/lead/documents',              label: 'Documents' },
  { href: '/lead/learning',              label: 'Learning' },
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
      <Topbar title="LEAD" subtitle="Documents, roadmap and learning" />

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
