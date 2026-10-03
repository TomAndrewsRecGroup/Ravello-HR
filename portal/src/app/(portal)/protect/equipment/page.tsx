import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { AlertTriangle, Lock, Package, ShieldAlert } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { HS_EQUIPMENT_STATUS_LABELS, ISOLATION_TYPE_LABELS, ISOLATION_STATUS_LABELS, PERMIT_STATUS_LABELS, type IsolationType, type IsolationStatus, type PermitStatus } from '@/lib/hs/vocab';
import { HAZARD_STATUS_LABELS, type HazardStatus } from '@/lib/hs/safetyVocab';
import type { HsEquipment } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Equipment' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

// Read-only: staff maintain the equipment register on the client's
// behalf, same posture as the Register and Documents tabs.
export default async function ProtectEquipmentPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: equipment, error } = await supabase
    .from('hs_equipment')
    .select('id, name, category, serial_number, status, last_inspected_on, next_inspection_due')
    .eq('company_id', companyId)
    .order('name')
    .limit(500);

  const rows = (equipment ?? []) as HsEquipment[];
  const today = new Date().toISOString().slice(0, 10);
  const equipmentIds = rows.map(r => r.id);

  // Reports a worker left via this item's own entity QR scan
  // (/e/[token] -> report-hazard, 201) land in `hazards` tagged with
  // `linked_asset_id` — nothing surfaced that back onto the asset
  // itself until now, so a scanned report was invisible from here.
  const { data: hazards } = equipmentIds.length > 0
    ? await supabase.from('hazards')
        .select('id, title, status, identified_at, linked_asset_id')
        .eq('company_id', companyId)
        .in('linked_asset_id', equipmentIds)
        .order('identified_at', { ascending: false })
        .limit(500)
    : { data: [] as { id: string; title: string; status: string; identified_at: string; linked_asset_id: string }[] };

  const hazardsByAsset = new Map<string, { id: string; title: string; status: string; identified_at: string }[]>();
  for (const h of hazards ?? []) {
    const list = hazardsByAsset.get(h.linked_asset_id) ?? [];
    list.push(h);
    hazardsByAsset.set(h.linked_asset_id, list);
  }

  // UI/UX cross-linking pass (2026-10-03): mirrors admin's own
  // EquipmentClient.tsx fix — an asset's quarantined/out_of_service
  // status often traces to a still-open isolation or permit, which
  // this page never surfaced.
  const [{ data: isolations }, { data: permits }] = equipmentIds.length > 0
    ? await Promise.all([
        supabase.from('isolations')
          .select('id, asset_id, isolation_type, status, applied_at')
          .eq('company_id', companyId)
          .in('asset_id', equipmentIds)
          .neq('status', 'removed')
          .order('applied_at', { ascending: false })
          .limit(500),
        supabase.from('permits')
          .select('id, asset_id, permit_number, status, issued_at')
          .eq('company_id', companyId)
          .in('asset_id', equipmentIds)
          .in('status', ['issued', 'suspended'])
          .order('issued_at', { ascending: false })
          .limit(500),
      ])
    : [{ data: [] as { id: string; asset_id: string; isolation_type: string; status: string; applied_at: string }[] },
       { data: [] as { id: string; asset_id: string; permit_number: string | null; status: string; issued_at: string | null }[] }];

  const isolationsByAsset = new Map<string, { id: string; isolation_type: string; status: string; applied_at: string }[]>();
  for (const iso of isolations ?? []) {
    if (!iso.asset_id) continue;
    const list = isolationsByAsset.get(iso.asset_id) ?? [];
    list.push(iso);
    isolationsByAsset.set(iso.asset_id, list);
  }

  const permitsByAsset = new Map<string, { id: string; permit_number: string | null; status: string; issued_at: string | null }[]>();
  for (const p of permits ?? []) {
    if (!p.asset_id) continue;
    const list = permitsByAsset.get(p.asset_id) ?? [];
    list.push(p);
    permitsByAsset.set(p.asset_id, list);
  }

  const fmtDt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Equipment could not be loaded. Refresh to try again.</p>}
      {rows.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <Package size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No equipment on the register yet</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Equipment</th><th>Category</th><th>Status</th><th>Last inspected</th><th>Next due</th></tr>
            </thead>
            <tbody>
              {rows.map(item => {
                const overdue = item.status === 'in_service' && item.next_inspection_due && item.next_inspection_due < today;
                const itemHazards = hazardsByAsset.get(item.id) ?? [];
                const itemIsolations = isolationsByAsset.get(item.id) ?? [];
                const itemPermits = permitsByAsset.get(item.id) ?? [];
                return (
                  <Fragment key={item.id}>
                    <tr id={`eq-${item.id}`}>
                      <td>{item.name}{item.serial_number && <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{item.serial_number}</span>}</td>
                      <td>{item.category ?? '—'}</td>
                      <td>{HS_EQUIPMENT_STATUS_LABELS[item.status]}</td>
                      <td>{fmt(item.last_inspected_on)}</td>
                      <td style={{ color: overdue ? 'var(--red)' : 'var(--ink)', fontWeight: overdue ? 600 : 400 }}>
                        {overdue && <AlertTriangle size={12} className="inline mr-1" />}
                        {fmt(item.next_inspection_due)}
                      </td>
                    </tr>
                    {itemHazards.length > 0 && (
                      <tr>
                        <td colSpan={5} className="pt-0">
                          <div className="rounded-lg p-2 text-xs space-y-1" style={{ background: 'var(--surface-soft)' }}>
                            <p className="flex items-center gap-1 font-medium" style={{ color: 'var(--ink-soft)' }}>
                              <ShieldAlert size={12} /> Reports from this item&apos;s QR code
                            </p>
                            <ul className="space-y-0.5">
                              {itemHazards.map(h => (
                                <li key={h.id}>
                                  <Link href={`/protect/hazards/${h.id}`} style={{ color: 'var(--purple)' }}>{h.title}</Link>{' '}
                                  <span style={{ color: 'var(--ink-faint)' }}>
                                    — {HAZARD_STATUS_LABELS[h.status as HazardStatus] ?? h.status} · {fmt(h.identified_at?.slice(0, 10) ?? null)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                    {(itemIsolations.length > 0 || itemPermits.length > 0) && (
                      <tr>
                        <td colSpan={5} className="pt-0">
                          <div className="rounded-lg p-2 text-xs space-y-1" style={{ background: 'var(--surface-soft)' }}>
                            <p className="flex items-center gap-1 font-medium" style={{ color: 'var(--ink-soft)' }}>
                              <Lock size={12} /> Open isolations &amp; permits against this asset
                            </p>
                            <ul className="space-y-0.5">
                              {itemIsolations.map(iso => (
                                <li key={iso.id}>
                                  <Link href="/protect/isolations" style={{ color: 'var(--purple)' }}>
                                    {ISOLATION_TYPE_LABELS[iso.isolation_type as IsolationType] ?? iso.isolation_type} isolation
                                  </Link>{' '}
                                  <span style={{ color: 'var(--ink-faint)' }}>
                                    — {ISOLATION_STATUS_LABELS[iso.status as IsolationStatus] ?? iso.status} · applied {fmtDt(iso.applied_at)}
                                  </span>
                                </li>
                              ))}
                              {itemPermits.map(p => (
                                <li key={p.id}>
                                  <Link href="/protect/permits" style={{ color: 'var(--purple)' }}>
                                    Permit {p.permit_number ?? 'to work'}
                                  </Link>{' '}
                                  <span style={{ color: 'var(--ink-faint)' }}>
                                    — {PERMIT_STATUS_LABELS[p.status as PermitStatus] ?? p.status} · issued {fmtDt(p.issued_at)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
