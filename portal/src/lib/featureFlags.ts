// ─────────────────────────────────────────────────────────────────
// Single source of truth for which feature flags are PAID modules
// (count toward the Stripe retainer) vs FREE modules (don't trigger
// any billing setup).
//
// Used by:
//   • /clients/onboard — to render the PAID/FREE checkbox sections
//     and hide the £ retainer step when only free flags are selected.
//   • POST /api/admin/clients — to skip Stripe AND skip the portal
//     onboarding wizard for free-only clients.
//   • portal Sidebar — to hide the /billing nav entry for clients
//     whose company has no paid flags and no live Stripe subscription.
//
// Adding a new free-tier programme later? Add its key to FREE_FLAGS
// and to the appropriate FLAG_GROUPS entry. Anything not in FREE_FLAGS
// is treated as paid by default — which is the safe default.
// ─────────────────────────────────────────────────────────────────

export const FREE_FLAGS: ReadonlySet<string> = new Set([
  'athletes_to_industry',
]);

export interface FlagDef { key: string; label: string }
export interface FlagGroup {
  label:       string;
  description: string;
  tier:        'paid' | 'free';
  flags:       FlagDef[];
}

export const FLAG_GROUPS: FlagGroup[] = [
  {
    label: 'HIRE',
    description: 'Recruitment and talent acquisition',
    tier: 'paid',
    flags: [
      { key: 'hiring',           label: 'Hiring Pipeline' },
      { key: 'friction_lens',    label: 'Friction Lens Scoring' },
      { key: 'benchmarks',       label: 'Salary Benchmarks' },
      { key: 'ivylens_market',   label: 'IvyLens Market Access' },
      { key: 'hiring_analytics', label: 'Hiring Analytics' },
      { key: 'jd_templates',     label: 'JD Templates' },
      { key: 'manatal_ats',      label: 'Manatal ATS Integration' },
    ],
  },
  {
    label: 'LEAD',
    description: 'People development and learning',
    tier: 'paid',
    flags: [
      { key: 'lead',             label: 'LEAD Module (master)' },
      { key: 'employee_records', label: 'Employee Records' },
      { key: 'hr_reports',       label: 'HR Reports' },
      { key: 'training',         label: 'Training Needs' },
      { key: 'reviews',          label: 'Performance Reviews' },
      { key: 'skills_matrix',    label: 'Skills Matrix' },
      { key: 'learning',         label: 'E-Learning Marketplace' },
      { key: 'onboarding',       label: 'Onboarding Workflows' },
      { key: 'org_chart',        label: 'Organisation Chart' },
      { key: 'documents',        label: 'Document Management' },
      { key: 'roadmap',          label: 'Roadmap' },
    ],
  },
  {
    label: 'PROTECT',
    description: 'Compliance, absence and risk',
    tier: 'paid',
    flags: [
      { key: 'protect',                label: 'PROTECT Module (master)' },
      { key: 'compliance',             label: 'Compliance Tracking' },
      { key: 'absence',                label: 'Absence Management' },
      { key: 'employee_docs',          label: 'Employee Documents' },
      { key: 'offboarding',            label: 'Offboarding Workflows' },
      { key: 'policy_acknowledgement', label: 'Policy Acknowledgements' },
      { key: 'protect_dashboard',      label: 'HR Dashboard' },
      { key: 'protect_reports',        label: 'PROTECT Reports' },
    ],
  },
  {
    label: 'General',
    description: 'Platform-wide features',
    tier: 'paid',
    flags: [
      { key: 'support',  label: 'HR Support & Tickets' },
      { key: 'metrics',  label: 'Metrics Dashboard' },
      { key: 'reports',  label: 'CSV Reports' },
      { key: 'calendar', label: 'Company Calendar' },
    ],
  },
  {
    label: 'Programmes',
    description: 'Free programme channels — no billing required',
    tier: 'free',
    flags: [
      { key: 'athletes_to_industry', label: 'Athletes To Industry' },
    ],
  },
];

/** True if any paid-tier flag is enabled in the given map. */
export function hasPaidFlag(flags: Record<string, boolean> | null | undefined): boolean {
  if (!flags) return false;
  for (const [k, v] of Object.entries(flags)) {
    if (v && !FREE_FLAGS.has(k)) return true;
  }
  return false;
}

/** True if any flag at all is enabled. */
export function hasAnyFlag(flags: Record<string, boolean> | null | undefined): boolean {
  if (!flags) return false;
  return Object.values(flags).some(Boolean);
}
