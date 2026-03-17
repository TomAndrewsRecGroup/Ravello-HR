import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'Clients' };

export default async function ClientsPage() {
  const supabase = createServerSupabaseClient();
  const { data: companies } = await supabase
    .from('companies').select('*').order('name');
  const all = companies ?? [];

  return (
    <>
      <AdminTopbar
        title="Clients"
        subtitle={`${all.length} companies`}
        actions={<Link href="/clients/new" className="btn-cta btn-sm flex items-center gap-1.5"><Plus size={13}/>New Client</Link>}
      />
      <main className="admin-page flex-1">
        {all.length === 0 ? (
          <div className="card p-12 empty-state">No clients yet. <Link href="/clients/new" className="btn-cta mt-2">Add first client</Link></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Company</th><th>Sector</th><th>Size</th><th>Status</th><th>Modules</th><th></th></tr>
              </thead>
              <tbody>
                {all.map((c: any) => {
                  const flags = c.feature_flags ?? {};
                  const on    = Object.values(flags).filter(Boolean).length;
                  const total = Object.keys(flags).length;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clients/${c.id}`} className="font-semibold hover:underline" style={{ color: 'var(--purple)' }}>{c.name}</Link>
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }}>{c.sector ?? '—'}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{c.size_band ?? '—'}</td>
                      <td><span className={`badge ${c.active ? 'badge-active' : 'badge-inactive'}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ color: 'var(--ink-soft)' }}>{total > 0 ? `${on}/${total} on` : '—'}</td>
                      <td><Link href={`/clients/${c.id}`} className="btn-ghost btn-sm">Manage →</Link></td>
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
