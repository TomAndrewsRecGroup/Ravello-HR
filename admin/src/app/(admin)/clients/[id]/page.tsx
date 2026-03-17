import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import FeatureFlagToggles from '@/components/modules/FeatureFlagToggles';
import ClientStatusToggle from '@/components/modules/ClientStatusToggle';

export const metadata: Metadata = { title: 'Client Detail' };

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const [{ data: company }, { data: users }, { data: reqs }, { data: tickets }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', params.id).single(),
    supabase.from('profiles').select('*').eq('company_id', params.id).order('created_at'),
    supabase.from('requisitions').select('id,title,stage').eq('company_id', params.id).order('created_at',{ascending:false}).limit(10),
    supabase.from('tickets').select('id,subject,status,priority').eq('company_id', params.id).neq('status','closed').order('created_at',{ascending:false}).limit(10),
  ]);
  if (!company) notFound();

  const c = company as any;

  return (
    <>
      <AdminTopbar
        title={c.name}
        subtitle={[c.sector, c.size_band].filter(Boolean).join(' · ')}
        actions={<Link href="/clients" className="btn-secondary btn-sm">← All Clients</Link>}
      />
      <main className="admin-page flex-1">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">

          <div className="space-y-6">
            {/* Details */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Company Details</h2>
                <ClientStatusToggle companyId={c.id} currentActive={c.active} />
              </div>
              <dl className="grid sm:grid-cols-2 gap-4">
                {[['Contact email', c.contact_email], ['Sector', c.sector], ['Size', c.size_band], ['Created', new Date(c.created_at).toLocaleDateString('en-GB')]].map(([l,v]) => (
                  <div key={l as string}>
                    <dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{l}</dt>
                    <dd className="text-sm font-medium mt-0.5" style={{ color: v ? 'var(--ink)' : 'var(--ink-faint)' }}>{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Users */}
            <div className="card p-6">
              <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
                Users ({users?.length ?? 0})
              </h2>
              {(!users || users.length === 0) ? (
                <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No users assigned.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
                    <tbody>
                      {users.map((u: any) => (
                        <tr key={u.id}>
                          <td className="font-medium">{u.full_name ?? '—'}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
                          <td><span className={`badge badge-${u.role.includes('admin') ? 'admin' : u.role.includes('staff') ? 'staff' : 'client'}`}>{u.role}</span></td>
                          <td style={{ color: 'var(--ink-faint)' }}>{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Requisitions */}
            {reqs && reqs.length > 0 && (
              <div className="card p-6">
                <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>Recent Roles</h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Role</th><th>Stage</th></tr></thead>
                    <tbody>
                      {reqs.map((r: any) => (
                        <tr key={r.id}>
                          <td>{r.title}</td>
                          <td><span className="badge badge-inprogress">{r.stage.replace(/_/g,' ')}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Feature flags */}
          <div className="card p-6 h-fit">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Feature Flags</h2>
            <FeatureFlagToggles companyId={c.id} flags={c.feature_flags ?? {}} />
          </div>
        </div>
      </main>
    </>
  );
}
