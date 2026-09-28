import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { effectiveCompanyId } from '@/lib/auth/activeOrganisation';
import OpenWorkspace from './OpenWorkspace';

export const metadata: Metadata = { title: 'Open workspace' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only a same-app PROTECT path: never an absolute URL (open redirect).
const SAFE_NEXT = /^\/protect(\/[A-Za-z0-9\-/]*)?$/;

// Entry point for the admin app's "Open safety workspace" link. Switching
// organisation is a state change, so it happens on a button (a POST to
// /api/organisation/switch, which calls set_active_organisation — the
// database decides whether this user may act there, and audits it), not
// on arrival: a link from anywhere must not be able to move someone's
// working organisation.
export default async function OpenWorkspacePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const org = typeof sp.org === 'string' && UUID.test(sp.org) ? sp.org : null;
  const next = typeof sp.next === 'string' && SAFE_NEXT.test(sp.next) ? sp.next : '/protect';
  if (!org) redirect('/dashboard');

  const supabase = await createServerSupabaseClient();
  const [current, { data: company }] = await Promise.all([
    effectiveCompanyId(supabase),
    supabase.from('companies').select('id, name').eq('id', org).maybeSingle(),
  ]);
  if (current === org) redirect(next);

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <OpenWorkspace organisationId={org} name={(company as { name?: string } | null)?.name ?? null} next={next} />
    </main>
  );
}
