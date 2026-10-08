// The HIRE section's tab list — the ONE place this list is defined.
// layout.tsx renders it; page.tsx's own index redirect picks the
// first one this client can reach, walked in this exact same order
// — the same single-source-of-truth discipline lib/lead/tabs.ts
// applies, so the two can never drift the way LEAD's once did
// (2026-10-08).

export interface HireTab { href: string; label: string }

export const HIRE_TABS: HireTab[] = [
  { href: '/hire/hiring',        label: 'Hiring' },
  { href: '/hire/internal',      label: 'Internal Roles' },
  { href: '/hire/cost-modeller', label: 'Cost Modeller' },
  { href: '/hire/vacancy-cost',  label: 'Vacancy Cost' },
  { href: '/hire/friction-lens', label: 'Friction Lens' },
  { href: '/hire/metrics',       label: 'Metrics' },
  { href: '/hire/hiring/analytics', label: 'Analytics' },
  { href: '/hire/benchmarks',    label: 'Benchmarks' },
];
