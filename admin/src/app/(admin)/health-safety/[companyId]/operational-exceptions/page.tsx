import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { portalUrl } from '@/lib/portalUrl';
import {
  computeOperationalExceptions, type AssetRow, type PersonStatusRow, type StaleCheckinRow, type AssetRefRow,
} from '@/lib/operationalExceptions/analyze';
import OperationalExceptionsView from '@/components/hs/OperationalExceptionsView';

export const metadata: Metadata = { title: 'Operational Exceptions' };
export const dynamic = 'force-dynamic';

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface MatrixRow { person_id: string; full_name: string; result: { status: string } | null }
interface SiteCheckinIdRow { id: string; person_id: string }
interface EquipmentIdRow { id: string; name: string; status: string; next_inspection_due: string | null }
interface AssetIdRow { id: string; asset_id: string | null }

// Go-live gap list, item 10: Operational Exception Detection. Scoped
// as deterministic cross-signal correlation, never statistical/ML
// anomaly detection — see lib/operationalExceptions/analyze.ts's own
// header for the full reasoning and the exact decision this codebase
// already recorded before building anything.
//
// Every table here is already staff-readable (hs_equipment/
// isolations/permits are 'staff ALL'; site_checkins the same), and
// workforce_matrix() explicitly allows is_tps_staff() — so staff reads
// everything directly, exactly like every other admin per-company
// page. People have no admin-side profile page of their own (the
// Core 360 Status precedent, Phase 27 Group 4) — a person's row links
// OUT to the portal's own workforce profile instead of nowhere.
export default async function OperationalExceptionsPage(props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  const supabase = await createServerSupabaseClient();
  const today = toISODate(new Date());
  const startOfToday = `${today}T00:00:00Z`;

  const [matrix, checkins, equipment, isolations, permits] = await Promise.all([
    supabase.rpc('workforce_matrix', { p_company: companyId }),
    readAllPages<SiteCheckinIdRow>((from, to) =>
      supabase.from('site_checkins').select('id, person_id').eq('company_id', companyId)
        .is('checked_out_at', null).lt('checked_in_at', startOfToday).order('id').range(from, to)),
    readAllPages<EquipmentIdRow>((from, to) =>
      supabase.from('hs_equipment').select('id, name, status, next_inspection_due').eq('company_id', companyId)
        .neq('status', 'decommissioned').order('id').range(from, to)),
    readAllPages<AssetIdRow>((from, to) =>
      supabase.from('isolations').select('id, asset_id').eq('company_id', companyId)
        .eq('status', 'applied').order('id').range(from, to)),
    readAllPages<AssetIdRow>((from, to) =>
      supabase.from('permits').select('id, asset_id').eq('company_id', companyId)
        .in('status', ['issued', 'suspended']).order('id').range(from, to)),
  ]);

  const loadError = matrix.error?.message ?? checkins.error ?? equipment.error ?? isolations.error ?? permits.error ?? null;

  const people: PersonStatusRow[] = ((matrix.data ?? []) as MatrixRow[]).map(r => ({
    personId: r.person_id, fullName: r.full_name, status: r.result?.status ?? 'REVIEW_REQUIRED',
  }));
  const staleCheckins: StaleCheckinRow[] = checkins.rows.map(r => ({ personId: r.person_id }));
  const assets: AssetRow[] = equipment.rows.map(r => ({
    id: r.id, name: r.name, status: r.status as AssetRow['status'], nextInspectionDue: r.next_inspection_due,
  }));
  const openIsolations: AssetRefRow[] = isolations.rows.map(r => ({ assetId: r.asset_id }));
  const openPermits: AssetRefRow[] = permits.rows.map(r => ({ assetId: r.asset_id }));

  const summary = computeOperationalExceptions({ today, people, staleCheckins, assets, openIsolations, openPermits });

  return (
    <OperationalExceptionsView
      summary={summary}
      loadError={loadError}
      personHref={(personId) => `${portalUrl()}/lead/workforce/people/${personId}`}
      assetHref={() => `/health-safety/${companyId}/equipment`}
    />
  );
}
