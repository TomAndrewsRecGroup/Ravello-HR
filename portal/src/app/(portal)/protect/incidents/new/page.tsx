import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSafetyContext, orgSitesAndDepartments, param } from '@/lib/hs/safetyContext';
import { HS_INCIDENT_TYPES, type HsIncidentType } from '@/lib/hs/vocab';
import IncidentReportForm from './IncidentReportForm';

export const metadata: Metadata = { title: 'Report an incident' };
export const dynamic = 'force-dynamic';

export default async function NewIncidentPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const ctx = await getSafetyContext();
  if (!ctx.companyId) redirect('/protect/incidents');
  if (!ctx.can('incident.create')) redirect('/protect/incidents');
  const [{ sites }, people] = await Promise.all([
    orgSitesAndDepartments(ctx.supabase, ctx.companyId),
    // Only the people this user may already see (RLS); anyone else is typed by name.
    ctx.supabase.from('people').select('id, full_name').eq('company_id', ctx.companyId).eq('active_status', 'active').order('full_name').limit(500),
  ]);
  const t = param(sp, 'type');
  const initialType = (HS_INCIDENT_TYPES as readonly string[]).includes(t) ? (t as HsIncidentType) : '';
  return (
    <main className="portal-page flex-1">
      <IncidentReportForm companyId={ctx.companyId} sites={sites} initialType={initialType}
        people={(people.data ?? []) as { id: string; full_name: string }[]} />
    </main>
  );
}
