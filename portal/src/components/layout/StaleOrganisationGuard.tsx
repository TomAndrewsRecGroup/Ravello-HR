'use client';

// Core-OS 360 Phase 6, Group 7 (section 12: Client Switcher Hardening).
//
// "A form opened under Client A must not accidentally submit under
// Client B after a switch." The portal layout already re-derives the
// active organisation from the database on every SERVER render and
// redirects a stale session cookie before anything renders
// (readEffectiveCompany() + sessionIsStale(), (portal)/layout.tsx) —
// that already protects every navigation and reload. This component
// covers the one case that leaves: a tab that never reloads. A
// consultant opens a form under Client A, switches to Client B in a
// different tab (or the grant simply expires), and keeps typing in the
// first tab — its own JavaScript has no way to know the switch
// happened, since no new server render ran to catch it.
//
// This polls GET /api/organisation/current on FOCUS and visibility
// changes (never a tight interval timer — those moments are exactly
// when a stale tab is actually being returned to) and compares the
// answer against the organisation id this page was rendered under. A
// mismatch shows a blocking banner rather than silently letting the
// next save land wherever the session happens to be active now.
//
// Renders nothing for a single-organisation user — there is no
// switcher for them to leave stale, the same guard OrganisationBar
// itself already applies.

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  companyId: string;
  organisationCount: number;
}

/** Pure comparison, extracted for its own test — never flag on a null/
 *  missing live id (a failed or ambiguous check is not evidence of
 *  staleness, the same "fail closed on refusal, not on doubt" posture
 *  the rest of this guard follows). */
export function isOrganisationStale(renderedCompanyId: string, liveCompanyId: string | null): boolean {
  return !!liveCompanyId && liveCompanyId !== renderedCompanyId;
}

export default function StaleOrganisationGuard({ companyId, organisationCount }: Props) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (organisationCount < 2) return;

    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/organisation/current', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const body = await res.json().catch(() => null);
        const liveId = body?.companyId ?? null;
        if (!cancelled && isOrganisationStale(companyId, liveId)) setStale(true);
      } catch {
        // A failed check is not evidence of staleness — never flag on
        // a network error, only on a confirmed mismatch.
      }
    }

    // Check once on mount (covers a tab restored from sleep/bfcache,
    // which does not always fire visibilitychange reliably) and again
    // every time the tab regains focus or becomes visible.
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [companyId, organisationCount]);

  if (!stale) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 sm:px-6 py-3 text-sm"
      style={{ background: 'rgba(217,68,68,0.08)', borderBottom: '1px solid var(--red)', color: 'var(--ink)' }}
    >
      <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} aria-hidden="true" />
      <span>
        You are now working in a different organisation than this tab is showing.
        Refresh before making any changes, or your next save may apply to the wrong organisation.
      </span>
      <button onClick={() => window.location.reload()} className="btn-secondary btn-sm ml-auto flex-shrink-0">
        Refresh
      </button>
    </div>
  );
}
