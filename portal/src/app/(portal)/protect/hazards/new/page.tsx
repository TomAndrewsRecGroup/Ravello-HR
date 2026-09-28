import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSafetyContext, orgSitesAndDepartments } from '@/lib/hs/safetyContext';
import HazardReportForm from './HazardReportForm';

export const metadata: Metadata = { title: 'Report a hazard' };
export const dynamic = 'force-dynamic';

export default async function NewHazardPage() {
  const ctx = await getSafetyContext();
  if (!ctx.companyId) redirect('/protect/hazards');
  if (!ctx.can('hazard.report')) redirect('/protect/hazards');
  const [{ sites }, cats] = await Promise.all([
    orgSitesAndDepartments(ctx.supabase, ctx.companyId),
    ctx.supabase.from('hazard_categories').select('id, name').eq('active', true).order('sort_order').limit(200),
  ]);
  return (
    <main className="portal-page flex-1">
      <HazardReportForm companyId={ctx.companyId} sites={sites}
        categories={(cats.data ?? []) as { id: string; name: string }[]} />
    </main>
  );
}
