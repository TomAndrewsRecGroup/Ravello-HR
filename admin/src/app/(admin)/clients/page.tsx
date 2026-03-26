import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { Plus, Briefcase, LifeBuoy, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = { title: 'Clients' };

export default async function ClientsPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: companies }, { data: reqs }, { data: tickets }, { data: complianceItems }] = await Promise.all([
    supabase.from('companies').select('*').order('name'),
    supabase.from('requisitions').select('company_id,stage').neq('stage', 'filled').neq('stage', 'cancelled'),
    supabase.from('tickets').select('company_id,status').in('status', ['open', 'in_progress']),
    supabase.from('compliance_items').select('company_id,status,due_date').neq('status', 'complete'),
  ]);

  const all = companies ?? [];

  // Build per-company lookup maps
  const activeRolesMap: Record<string, number> = {};
  const openTicketsMap: Record<string, number> = {};
  const overdueCompMap: Record<string, number> = {};

  for (const r of reqs ?? []) {
    activeRolesMap[r.company_id] = (activeRolesMap[r.company_id] ?? 0) + 1;
  }
  for (const t of tickets ?? []) {
    openTicketsMap[t.company_id] = (openTicketsMap[t.company_id] ?? 0) + 1;
  }
  const now = new Date();
  for (const c of complianceItems ?? []) {
    if (c.due_date && new Date(c.due_date) < now) {
      overdueCompMap[c.company_id] = (overdueCompMap[c.company_id] ?? 0) + 1;
    }
  }

  const activeCount   = all.filter((c: any) => c.active).length;
  const inactiveCount = all.filter((c: any) => !c.active).length;

  return (
    <>
      <AdminTopbar
        title="Clients"
        subtitle={`${activeCount} active, ${inactiveCount} inactive`}
        actions={<Link href="/clients/new" className="btn-cta btn-sm flex items-center gap-1.5"><Plus size={13} />New Client</Link>}
      />
      <main className="admin-page flex-1">
        {all.length === 0 ? (
          <div className="card p-12 empty-state">
            No clients yet.
            <Link href="/clients/new" className="btn-cta mt-2">Add first client</Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Sector</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Active Roles</th>
                  <th>Open Tickets</th>
                  <th>Overdue Compliance</th>
                  <th>Modules</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {all.map((c: any) => {
                  const flags         = c.feature_flags ?? {};
                  const on            = Object.values(flags).filter(Boolean).length;
                  const total         = Object.keys(flags).length;
                  const activeRoles   = activeRolesMap[c.id] ?? 0;
                  const openTickets   = openTicketsMap[c.id] ?? 0;
                  const overdueComp   = overdueCompMap[c.id] ?? 0;

                  return (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/clients/${c.id}`}
                          className="font-semibold hover:underline"
                          style={{ color: 'var(--purple)' }}
                        >
                          {c.name}
                        </Link>
                        {c.contact_email && (
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{c.contact_email}</p>
                        )}
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }}>{c.sector ?? '—'}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{c.size_band ?? '—'}</td>
                      <td>
                        <span className={`badge ${c.active ? 'badge-active' : 'badge-inactive'}`}>
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {activeRoles > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--purple)' }}>
                            <Briefcase size={12} /> {activeRoles}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-faint)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {openTickets > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: '#F59E0B' }}>
                            <LifeBuoy size={12} /> {openTickets}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-faint)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {overdueComp > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--red)' }}>
                            <AlertTriangle size={12} /> {overdueComp}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-faint)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }}>
                        {total > 0 ? `${on}/${total} on` : '—'}
                      </td>
                      <td>
                        <Link href={`/clients/${c.id}`} className="btn-ghost btn-sm">
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
