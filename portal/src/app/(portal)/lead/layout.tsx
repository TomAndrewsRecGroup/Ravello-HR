import Topbar from '@/components/layout/Topbar';
import GroupedTabs from '@/components/layout/GroupedTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Absence, employee documents, offboarding and the HR dashboard moved
// here from PROTECT on 2026-09-24, when PROTECT became Health & Safety.
const TAB_GROUPS: { label: string; tabs: { href: string; label: string; cap?: string }[] }[] = [
  {
    label: 'People',
    tabs: [
      { href: '/lead/employee-records', label: 'Employees' },
      { href: '/lead/org-chart',        label: 'Org Chart' },
      { href: '/lead/onboarding',       label: 'Onboarding' },
      { href: '/lead/offboarding',      label: 'Offboarding' },
      { href: '/lead/absence',          label: 'Absence' },
    ],
  },
  {
    // Core-OS 360 Phase 3: who is ready to deploy, and why.
    label: 'Workforce',
    tabs: [
      { href: '/lead/workforce',            label: 'Safe to Deploy' },
      { href: '/lead/workforce/matrix',     label: 'Matrix' },
      { href: '/lead/workforce/roles',      label: 'Roles' },
      { href: '/lead/workforce/catalogue',  label: 'Catalogue' },
      { href: '/lead/workforce/sessions',   label: 'Sessions' },
      // Only for those who may read health outcomes (135); the page refuses everyone else too.
      { href: '/lead/workforce/occupational-health', label: 'Occupational Health', cap: 'occupational_health.summary.read' },
      { href: '/lead/workforce/me',         label: 'My compliance' },
    ],
  },
  {
    label: 'Docs',
    tabs: [
      { href: '/lead/documents',               label: 'Documents' },
      { href: '/lead/employee-docs',           label: 'Employee Docs' },
      { href: '/lead/policy-acknowledgements', label: 'Sign-off' },
    ],
  },
  {
    label: 'Develop',
    tabs: [
      { href: '/lead/learning',   label: 'Learning' },
      { href: '/lead/training',   label: 'Development needs' },
      { href: '/lead/training-records', label: 'Training Records' },
      { href: '/lead/reviews',    label: 'Reviews' },
      { href: '/lead/skills',     label: 'Skills' },
      { href: '/lead/roadmap',    label: 'Roadmap' },
    ],
  },
  {
    label: 'Insight',
    tabs: [
      { href: '/lead/hr-dashboard', label: 'HR Dashboard' },
      { href: '/lead/hr-reports',   label: 'Reports' },
    ],
  },
];

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  // Hide tabs for modules this client does not have — the middleware
  // would only bounce the click back to the dashboard.
  const flags = await currentModuleFlags();
  // A tab that needs a capability is offered only to those who hold it.
  let caps = new Set<string>();
  if (TAB_GROUPS.some(g => g.tabs.some(t => t.cap && isRouteEnabled(t.href, flags)))) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.rpc('my_capabilities');
    caps = new Set(Array.isArray(data) ? (data as string[]) : []);
  }
  const groups = TAB_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => isRouteEnabled(t.href, flags) && (!t.cap || caps.has(t.cap)))
                                   .map(({ href, label }) => ({ href, label })) }))
    .filter(g => g.tabs.length > 0);
  return (
    <>
      <Topbar title="LEAD" subtitle="People, HR, documents and development" />
      <GroupedTabs groups={groups} />
      {children}
    </>
  );
}
