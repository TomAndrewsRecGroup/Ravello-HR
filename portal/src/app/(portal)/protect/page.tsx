import { redirect } from 'next/navigation';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

// Land on the first tab this client has. A fixed target would bounce a
// client without that one sub-module straight back to the dashboard.
const ORDER = [
  '/protect/actions',
  '/protect/compliance',
  '/protect/offboarding',
  '/protect/reports',
];

export default async function ProtectIndexPage() {
  const flags = await currentModuleFlags();
  redirect(ORDER.find(href => isRouteEnabled(href, flags)) ?? '/dashboard');
}
