import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const supabase = createServerSupabaseClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('*, companies(name)')
    .order('created_at', { ascending: false });

  const all = users ?? [];

  const roleBadge = (r: string) =>
    r === 'ravello_admin' ? 'badge-admin'
    : r === 'ravello_staff' ? 'badge-staff'
    : r === 'client_admin'  ? 'badge-admin'
    : 'badge-client';

  return (
    <>
      <AdminTopbar title="Users" subtitle={`${all.length} accounts`} />
      <main className="admin-page flex-1">
        {all.length === 0 ? (
          <div className="card p-12 empty-state">No users yet.</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th><th>Created</th></tr>
              </thead>
              <tbody>
                {all.map((u: any) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.full_name ?? '—'}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                    <td><span className={`badge ${roleBadge(u.role)}`}>{u.role.replace(/_/g,' ')}</span></td>
                    <td style={{ color: 'var(--ink-soft)' }}>{(u as any).companies?.name ?? '—'}</td>
                    <td style={{ color: 'var(--ink-faint)' }}>{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
