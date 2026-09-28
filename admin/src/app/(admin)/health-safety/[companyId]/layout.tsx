import { notFound } from 'next/navigation';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import HsCompanyTabs from '@/components/hs/HsCompanyTabs';
import { portalUrl } from '@/lib/portalUrl';

// One client's H&S workspace, inside the normal admin shell — staff see
// every client, so a bad id is a 404, not an empty page.
export default async function HealthSafetyCompanyLayout(
  props: { children: React.ReactNode; params: Promise<{ companyId: string }> }
) {
  const params = await props.params;

  const {
    children
  } = props;

  const supabase = await createServerSupabaseClient();
  const { data: company } = await supabase.from('companies').select('id, name').eq('id', params.companyId).maybeSingle();
  if (!company) notFound();

  return (
    <>
      <AdminTopbar title={(company as { name: string }).name} subtitle="Health & Safety" />
      <main className="admin-page flex-1 space-y-5">
        <div className="card p-3 flex flex-wrap items-center gap-3 text-sm">
          <span style={{ color: 'var(--ink-soft)' }}>
            Hazards, risk assessments, RAMS, COSHH, incidents, investigations and RIDDOR reviews are worked in this client&apos;s safety workspace.
          </span>
          <a className="btn-secondary btn-sm ml-auto"
            href={`${portalUrl()}/open-workspace?org=${params.companyId}&next=${encodeURIComponent('/protect')}`}
            target="_blank" rel="noopener">
            Open safety workspace
          </a>
        </div>
        <HsCompanyTabs companyId={params.companyId} />
        {children}
      </main>
    </>
  );
}
