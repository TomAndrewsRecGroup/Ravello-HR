import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import HsCompanyTabs from '@/components/hs/HsCompanyTabs';
import { myGrant } from '@/lib/hs/access';

// One client's H&S workspace. A client that is not in this user's
// hs_my_companies() is a 404 — not a page of empty lists, which would
// confirm the id exists. (RLS would return nothing either way; this is
// about not rendering a shell for a client you cannot see.)
export default async function HsCompanyLayout({
  children, params,
}: { children: React.ReactNode; params: { companyId: string } }) {
  const supabase = createServerSupabaseClient();
  const company = await myGrant(supabase, params.companyId);
  if (!company) notFound();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{company.name}</h1>
        {company.access_level === 'read' && (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>You can view this client&apos;s records but not add to them.</p>
        )}
      </div>
      <HsCompanyTabs companyId={company.company_id} scopes={company.scopes} />
      {children}
    </div>
  );
}
