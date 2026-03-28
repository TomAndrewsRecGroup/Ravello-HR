'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Briefcase, LifeBuoy, AlertTriangle, Users, X } from 'lucide-react';

interface Company {
  id: string; name: string; contact_email: string | null;
  sector: string | null; size_band: string | null; active: boolean;
  feature_flags: Record<string, boolean> | null;
  friction_band: string | null;
}
interface Profile { id: string; full_name: string | null; email: string; role: string; created_at: string; }
interface Props {
  companies: Company[];
  usersByCompany: Record<string, Profile[]>;
  activeRolesMap: Record<string, number>;
  openTicketsMap: Record<string, number>;
  overdueCompMap: Record<string, number>;
}

export default function ClientsClient({ companies, usersByCompany, activeRolesMap, openTicketsMap, overdueCompMap }: Props) {
  const [usersModal, setUsersModal] = useState<{ company: Company; users: Profile[] } | null>(null);

  return (
    <>
      {/* Users modal */}
      {usersModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setUsersModal(null)}
        >
          <div
            className="card w-full max-w-lg max-h-[80vh] flex flex-col"
            style={{ padding: 0, overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <div>
                <h2 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>
                  {usersModal.company.name}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  {usersModal.users.length} user{usersModal.users.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/clients/${usersModal.company.id}`}
                  className="btn-secondary btn-sm"
                  onClick={() => setUsersModal(null)}
                >
                  Manage Client →
                </Link>
                <button onClick={() => setUsersModal(null)} className="btn-icon btn-ghost">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6">
              {usersModal.users.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--ink-faint)' }}>
                  No users assigned. Invite users from the client detail page.
                </p>
              ) : (
                <table className="table w-full">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersModal.users.map(u => (
                      <tr key={u.id}>
                        <td className="font-medium" style={{ color: 'var(--ink)' }}>{u.full_name ?? '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                        <td>
                          <span className={`badge badge-${u.role?.includes('admin') ? 'admin' : 'client'}`}>
                            {u.role?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ color: 'var(--ink-faint)' }}>
                          {new Date(u.created_at).toLocaleDateString('en-GB')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clients table */}
      {companies.length === 0 ? (
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
                <th>Users</th>
                <th>Active Roles</th>
                <th>Open Tickets</th>
                <th>Overdue Compliance</th>
                <th>Friction</th>
                <th>Modules</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const flags       = c.feature_flags ?? {};
                const on          = Object.values(flags).filter(Boolean).length;
                const total       = Object.keys(flags).length;
                const activeRoles = activeRolesMap[c.id] ?? 0;
                const openTickets = openTicketsMap[c.id] ?? 0;
                const overdueComp = overdueCompMap[c.id] ?? 0;
                const users       = usersByCompany[c.id] ?? [];

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
                      <button
                        onClick={() => setUsersModal({ company: c, users })}
                        className="inline-flex items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity"
                        style={{ color: users.length > 0 ? 'var(--purple)' : 'var(--ink-faint)' }}
                      >
                        <Users size={12} />
                        {users.length > 0 ? users.length : '—'}
                      </button>
                    </td>
                    <td>
                      {activeRoles > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--purple)' }}>
                          <Briefcase size={12} /> {activeRoles}
                        </span>
                      ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                    </td>
                    <td>
                      {openTickets > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: '#F59E0B' }}>
                          <LifeBuoy size={12} /> {openTickets}
                        </span>
                      ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                    </td>
                    <td>
                      {overdueComp > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--red)' }}>
                          <AlertTriangle size={12} /> {overdueComp}
                        </span>
                      ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                    </td>
                    <td>
                      {c.friction_band ? (
                        <span
                          className="badge text-xs"
                          style={
                            c.friction_band === 'Low Friction' ? { background: 'rgba(52,211,153,0.14)', color: '#047857' } :
                            c.friction_band === 'High Friction' ? { background: 'rgba(217,68,68,0.10)', color: '#B02020' } :
                            { background: 'rgba(245,158,11,0.15)', color: '#8A5500' }
                          }
                        >
                          {c.friction_band.replace(' Friction', '')}
                        </span>
                      ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
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
    </>
  );
}
