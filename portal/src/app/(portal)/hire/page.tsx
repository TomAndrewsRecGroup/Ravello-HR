import { redirect } from 'next/navigation';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';
import { HIRE_TABS } from '@/lib/hire/tabs';

// Land on the first tab this client has, walked in the exact order
// layout.tsx's own tabs render — see lib/hire/tabs.ts's header
// comment and the identical fix in lib/lead/tabs.ts.
export default async function HireIndexPage() {
  const flags = await currentModuleFlags();
  redirect(HIRE_TABS.find(t => isRouteEnabled(t.href, flags))?.href ?? '/dashboard');
}
