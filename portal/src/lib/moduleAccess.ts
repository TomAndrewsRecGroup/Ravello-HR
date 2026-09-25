// Which feature flags each portal page needs — the ONE map the
// middleware enforces, the section tabs hide by, and Quick Actions
// disable by.
//
// Until 2026-09-24 flags only locked sidebar items. Every HIRE / LEAD /
// PROTECT page except three still opened by typing its address, and
// the finer module flags (org_chart, skills_matrix, calendar,
// benchmarks, …) were offered on the admin toggle page but checked
// nowhere at all — a client could reach a module they had not paid for,
// and switching one off changed nothing but a menu.
//
// Rules:
//   • A page needs EVERY flag listed for it. A flag counts as off only
//     when it is exactly `false` — missing/undefined means ON, the same
//     convention as everywhere else (CLAUDE.md, "Feature flags").
//   • The longest segment-boundary prefix wins, so /hire/friction-lens
//     is decided by its own entry, not by /hire's.
//   • Free programmes are gated by their own flag ONLY, never by the
//     paid module they happen to live under: a free client with
//     `learning` on and `lead` off must still reach /lead/learning, and
//     `friction_lens` clients must reach /hire/friction-lens without
//     `hiring`.
//   • Every page under app/(portal) must be decided here — either in
//     ROUTE_FLAGS or in UNGATED_ROUTES. moduleAccess.test.ts walks the
//     filesystem and fails on a page in neither, so a new page cannot
//     ship silently ungated.

export const ROUTE_FLAGS: Readonly<Record<string, readonly string[]>> = {
  // HIRE
  '/hire':                        ['hiring'],
  '/hire/hiring/analytics':       ['hiring', 'hiring_analytics'],
  '/hire/benchmarks':             ['hiring', 'benchmarks'],
  '/hire/metrics':                ['metrics'],
  '/hire/friction-lens':          ['friction_lens'],

  // LEAD — the HR half. Absence, employee documents, offboarding and
  // the HR dashboard moved here from PROTECT on 2026-09-24 when PROTECT
  // became Health & Safety; their old /protect/* addresses redirect
  // (portal/redirects.mjs).
  '/lead':                        ['lead'],
  '/lead/employee-records':       ['lead', 'employee_records'],
  '/lead/org-chart':              ['lead', 'org_chart'],
  '/lead/onboarding':             ['lead', 'onboarding'],
  '/lead/offboarding':            ['lead', 'offboarding'],
  '/lead/absence':                ['lead', 'absence'],
  '/lead/documents':              ['lead', 'documents'],
  '/lead/employee-docs':          ['lead', 'employee_docs'],
  '/lead/policy-acknowledgements':['lead', 'policy_acknowledgement'],
  '/lead/hr-dashboard':           ['lead', 'protect_dashboard'],
  '/lead/hr-reports':             ['lead', 'hr_reports'],
  '/lead/reviews':                ['lead', 'reviews'],
  '/lead/training':               ['lead', 'training'],
  '/lead/training-records':       ['lead', 'training'],
  '/lead/skills':                 ['lead', 'skills_matrix'],
  '/lead/roadmap':                ['lead', 'roadmap'],
  '/lead/learning':               ['learning'],

  // PROTECT — Health & Safety
  '/protect':                     ['protect'],
  '/protect/compliance':          ['protect', 'compliance'],
  '/protect/documents':           ['protect'],
  '/protect/audits':              ['protect'],
  '/protect/incidents':           ['protect'],
  '/protect/equipment':           ['protect'],
  '/protect/timeline':            ['protect'],
  '/protect/reports':             ['protect', 'protect_reports'],

  // Everything else that is a module
  '/athletes-to-industry':        ['athletes_to_industry'],
  '/support':                     ['support'],
  '/calendar':                    ['calendar'],
};

/** Pages deliberately open to every signed-in client whatever their flags. */
export const UNGATED_ROUTES: readonly string[] = [
  '/dashboard',
  '/dev-plans',   // plans are assigned by TPS; no module owns them
  '/settings',
  '/billing',     // role-gated inside the page instead
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

/** The flags a path needs, or [] if no module owns it. */
export function requiredFlagsFor(pathname: string): readonly string[] {
  let best: string | null = null;
  for (const prefix of Object.keys(ROUTE_FLAGS)) {
    if (matches(pathname, prefix) && (best === null || prefix.length > best.length)) {
      best = prefix;
    }
  }
  return best === null ? [] : ROUTE_FLAGS[best];
}

/** The first required flag that is switched off for this path, or null. */
export function disabledFlagFor(
  pathname: string,
  flags: Record<string, boolean | undefined> | null | undefined,
): string | null {
  const f = flags ?? {};
  for (const key of requiredFlagsFor(pathname)) {
    if (f[key] === false) return key;
  }
  return null;
}

export function isRouteEnabled(
  pathname: string,
  flags: Record<string, boolean | undefined> | null | undefined,
): boolean {
  return disabledFlagFor(pathname, flags) === null;
}
