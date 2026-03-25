'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const CLIENT_ROLES = ['client_admin', 'client_viewer'];

const ROLE_BADGE: Record<string, string> = {
  ravello_admin:  'badge-admin',
  ravello_staff:  'badge-staff',
  client_admin:   'badge-admin',
  client_viewer:  'badge-client',
};

function RoleCell({ userId, initialRole }: { userId: string; initialRole: string }) {
  const supabase = createClient();
  const [role,    setRole]    = useState(initialRole);
  const [saving,  setSaving]  = useState(false);
  const isInternal = role.startsWith('ravello_');

  if (isInternal) {
    return <span className={`badge ${ROLE_BADGE[role] ?? 'badge-client'}`}>{role.replace(/_/g,' ')}</span>;
  }

  async function change(newRole: string) {
    setSaving(true);
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    setRole(newRole);
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="text-xs rounded-[6px] px-2 py-1 border"
        style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', fontSize: '11px' }}
        value={role}
        disabled={saving}
        onChange={e => change(e.target.value)}
      >
        {CLIENT_ROLES.map(r => (
          <option key={r} value={r}>{r.replace(/_/g,' ')}</option>
        ))}
      </select>
      {saving && <Loader2 size={11} className="animate-spin" style={{ color: 'var(--purple)' }} />}
    </div>
  );
}

export default function UsersClient({ users }: { users: any[] }) {
  const [search, setSearch] = useState('');

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.companies?.name?.toLowerCase().includes(q)
    );
  });

  if (users.length === 0) {
    return <div className="card p-12 empty-state">No users yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by name, email or company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {filtered.length} of {users.length}
        </p>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Company</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => (
              <tr key={u.id}>
                <td className="font-medium">{u.full_name ?? '—'}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                <td>
                  <RoleCell userId={u.id} initialRole={u.role ?? 'client_viewer'} />
                </td>
                <td>
                  {u.companies?.id ? (
                    <Link
                      href={`/clients/${u.companies.id}`}
                      className="hover:underline"
                      style={{ color: 'var(--purple)' }}
                    >
                      {u.companies.name}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--ink-faint)' }}>—</span>
                  )}
                </td>
                <td style={{ color: 'var(--ink-faint)' }}>{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
