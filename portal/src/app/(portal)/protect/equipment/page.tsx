import type { Metadata } from 'next';
import { AlertTriangle, Package } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { HS_EQUIPMENT_STATUS_LABELS } from '@/lib/hs/vocab';
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
                return (
                  <tr key={item.id}>
                    <td>{item.name}{item.serial_number && <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{item.serial_number}</span>}</td>
                    <td>{item.category ?? '—'}</td>
                    <td>{HS_EQUIPMENT_STATUS_LABELS[item.status]}</td>
                    <td>{fmt(item.last_inspected_on)}</td>
                    <td style={{ color: overdue ? 'var(--red)' : 'var(--ink)', fontWeight: overdue ? 600 : 400 }}>
                      {overdue && <AlertTriangle size={12} className="inline mr-1" />}
                      {fmt(item.next_inspection_due)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
