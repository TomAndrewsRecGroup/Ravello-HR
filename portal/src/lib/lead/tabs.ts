// The LEAD section's tab groups — the ONE place this list is defined.
//
// layout.tsx renders these groups; page.tsx's own index redirect picks
// the first one this viewer can actually reach, walked in this exact
// same order. Before 2026-10-08 the two were two independently
// hand-typed lists that had drifted: the redirect sent a client to
// Document Templates (inside the "Docs" group) while the top-left,
// first-rendered tab was Employees (inside "People") — so LEAD never
// actually landed on its own first tab. Never maintain a second copy
// of this order anywhere else.

export interface LeadTab { href: string; label: string; cap?: string }
export interface LeadTabGroup { label: string; tabs: LeadTab[] }

export const LEAD_TAB_GROUPS: LeadTabGroup[] = [
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
      { href: '/lead/document-templates',      label: 'Document Templates' },
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

/** Every tab, group by group, tab by tab — the exact order a reader
 *  sees on screen. The index page's redirect walks this list, never a
 *  separately maintained one. */
export function leadTabsFlat(): LeadTab[] {
  return LEAD_TAB_GROUPS.flatMap(g => g.tabs);
}
