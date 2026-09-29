import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readEffectiveCompany } from '@/lib/auth/activeOrganisation';

export const runtime = 'nodejs';

// GET /api/organisation/current
//
// Core-OS 360 Phase 6, Group 7 (section 12: Client Switcher Hardening).
// The portal layout already re-derives the active organisation FRESH
// from the database on every server render and redirects a stale
// session cookie before anything renders (readEffectiveCompany() +
// sessionIsStale(), (portal)/layout.tsx) — that already protects every
// navigation and reload. What it cannot catch is a tab that never
// reloads: a form left open, another tab switches organisation, and
// the first tab's own JavaScript is still running against a page
// rendered for the organisation that was active when it loaded.
//
// StaleOrganisationGuard polls this endpoint (on focus/visibility
// change, not on a tight timer) to answer exactly one question — "is
// the organisation THIS TAB believes it is showing still the one my
// session is actually active in" — so a form opened under Client A can
// warn before it might accidentally submit under Client B.
//
// This route makes no write of its own and needs no more than a plain
// signed-in check: my_company_id() already returns null/refuses for a
// caller with no live session.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const live = await readEffectiveCompany(supabase);
  if (!live.ok) return NextResponse.json({ error: 'Could not resolve organisation' }, { status: 500 });

  return NextResponse.json({ companyId: live.companyId });
}
