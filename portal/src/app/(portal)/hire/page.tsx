import { redirect } from 'next/navigation';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';

// Land on the first tab this client has. A fixed target would bounce a
// client without that one sub-module straight back to the dashboard.
const ORDER = [
  '/hire/hiring',
  '/hire/internal',
  '/hire/cost-modeller',
  '/hire/vacancy-cost',
  '/hire/friction-lens',
  '/hire/metrics',
  '/hire/benchmarks',
];

export default async function HireIndexPage() {
  const flags = await currentModuleFlags();
  redirect(ORDER.find(href => isRouteEnabled(href, flags)) ?? '/dashboard');
}
