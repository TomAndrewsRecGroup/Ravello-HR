import Topbar from '@/components/layout/Topbar';
import GroupedTabs from '@/components/layout/GroupedTabs';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LEAD_TAB_GROUPS as TAB_GROUPS } from '@/lib/lead/tabs';

// Absence, employee documents, offboarding and the HR dashboard moved
// here from PROTECT on 2026-09-24, when PROTECT became Health & Safety.
// The group list itself now lives in lib/lead/tabs.ts, shared with
// page.tsx's own index redirect — see that file's header comment.

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  // Hide tabs for modules this client does not have — the middleware
  // would only bounce the click back to the dashboard.
  const flags = await currentModuleFlags();
  // A tab that needs a capability is offered only to those who hold it.
  let caps = new Set<string>();
  if (TAB_GROUPS.some(g => g.tabs.some(t => t.cap && isRouteEnabled(t.href, flags)))) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.rpc('my_capabilities');
    caps = new Set(Array.isArray(data) ? (data as string[]) : []);
  }
  const groups = TAB_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => isRouteEnabled(t.href, flags) && (!t.cap || caps.has(t.cap)))
                                   .map(({ href, label }) => ({ href, label })) }))
    .filter(g => g.tabs.length > 0);
  return (
    <>
      <Topbar title="LEAD" subtitle="People, HR, documents and development" />
      <GroupedTabs groups={groups} />
      {children}
    </>
  );
}
