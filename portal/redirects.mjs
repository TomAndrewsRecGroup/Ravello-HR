// Addresses that moved. Read by next.config.mjs, and pinned by
// src/lib/__tests__/redirects.test.ts, which checks every source still
// has no page (a page there would never be reached) and every
// destination does.
//
// 2026-09-24: PROTECT became Health & Safety. The HR pages that lived
// under it moved to LEAD. Bookmarks, emailed links and notification
// rows stored with the old paths keep working.

/** @type {{ source: string; destination: string; permanent: boolean }[]} */
export const PORTAL_REDIRECTS = ['absence', 'offboarding', 'hr-dashboard', 'employee-docs'].flatMap(p => [
  { source: `/protect/${p}`,          destination: `/lead/${p}`,          permanent: true },
  { source: `/protect/${p}/:path*`,   destination: `/lead/${p}/:path*`,   permanent: true },
]);
