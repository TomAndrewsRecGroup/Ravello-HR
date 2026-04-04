import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { TrendingUp, PoundSterling, Calendar, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = { title: 'Revenue' };
export const revalidate = 60;

function fmt(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

export default async function RevenuePage() {
  const supabase = createServerSupabaseClient();

  const [servicesRes, compRes] = await Promise.all([
    supabase.from('client_services').select('*, companies(name, active)').order('company_id'),
    supabase.from('companies').select('id, name, active').eq('active', true).order('name'),
  ]);

  const services = servicesRes.data ?? [];
  const companies = compRes.data ?? [];

  // Calculate MRR
  const activeServices = services.filter((s: any) => s.status === 'active');
  const totalMRR = activeServices.reduce((sum: number, s: any) => sum + (s.monthly_fee ?? 0), 0);
  const totalARR = totalMRR * 12;
  const avgRevenuePerClient = companies.length > 0 ? totalMRR / companies.length : 0;

  // Revenue by client
  const revenueByClient = companies.map((c: any) => {
    const clientServices = activeServices.filter((s: any) => s.company_id === c.id);
    const mrr = clientServices.reduce((sum: number, s: any) => sum + (s.monthly_fee ?? 0), 0);
    return {
      ...c,
      services: clientServices,
      mrr,
      arr: mrr * 12,
      serviceCount: clientServices.length,
    };
  }).sort((a: any, b: any) => b.mrr - a.mrr);

  // Upcoming renewals (next 90 days)
  const now = new Date();
  const in90 = new Date(now); in90.setDate(now.getDate() + 90);
  const nowISO = now.toISOString().split('T')[0];
  const in90ISO = in90.toISOString().split('T')[0];
  const upcomingRenewals = activeServices.filter((s: any) =>
    s.renewal_date && s.renewal_date >= nowISO && s.renewal_date <= in90ISO
  );

  // Revenue by service type
  const byServiceType: Record<string, { count: number; mrr: number }> = {};
  activeServices.forEach((s: any) => {
    const key = s.service_name ?? 'Unknown';
    if (!byServiceType[key]) byServiceType[key] = { count: 0, mrr: 0 };
    byServiceType[key].count++;
    byServiceType[key].mrr += s.monthly_fee ?? 0;
  });

  return (
    <>
      <AdminTopbar title="Revenue" subtitle="MRR, client revenue and renewals" />
      <main className="admin-page flex-1">

        {/* Key metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Monthly Recurring</p>
            <p className="font-display font-bold text-2xl text-gradient">{fmt(totalMRR)}</p>
            <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>MRR</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Annual Run Rate</p>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--purple)' }}>{fmt(totalARR)}</p>
            <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>ARR</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Avg per Client</p>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--blue)' }}>{fmt(avgRevenuePerClient)}</p>
            <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>monthly</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Active Services</p>
            <p className="font-display font-bold text-2xl" style={{ color: '#14B8A6' }}>{activeServices.length}</p>
            <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>across {companies.length} clients</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          {/* Revenue by client */}
          <div className="card p-6">
            <h3 className="font-display text-base font-semibold mb-4" style={{ color: 'var(--ink)' }}>Revenue by Client</h3>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Services</th>
                    <th className="text-right">MRR</th>
                    <th className="text-right">ARR</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByClient.map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clients/${c.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--ink)' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {c.services.map((s: any) => (
                            <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--purple)' }}>
                              {s.service_name}
                            </span>
                          ))}
                          {c.serviceCount === 0 && <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>—</span>}
                        </div>
                      </td>
                      <td className="text-right text-sm font-semibold" style={{ color: c.mrr > 0 ? 'var(--ink)' : 'var(--ink-faint)' }}>
                        {c.mrr > 0 ? fmt(c.mrr) : '—'}
                      </td>
                      <td className="text-right text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {c.arr > 0 ? fmt(c.arr) : '—'}
                      </td>
                      <td>
                        {totalMRR > 0 && c.mrr > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.round((c.mrr / totalMRR) * 100)}%`, background: 'var(--gradient)' }} />
                            </div>
                            <span className="text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                              {Math.round((c.mrr / totalMRR) * 100)}%
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Revenue by service type */}
            <div className="card p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>By Service Type</h3>
              <div className="space-y-2.5">
                {Object.entries(byServiceType).sort((a, b) => b[1].mrr - a[1].mrr).map(([name, data]) => (
                  <div key={name} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{data.count} client{data.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--purple)' }}>{fmt(data.mrr)}</p>
                  </div>
                ))}
                {Object.keys(byServiceType).length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No active services</p>
                )}
              </div>
            </div>

            {/* Upcoming renewals */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={13} style={{ color: 'var(--ink-faint)' }} />
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Renewals (Next 90d)</h3>
              </div>
              {upcomingRenewals.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No upcoming renewals</p>
              ) : (
                <div className="space-y-2">
                  {upcomingRenewals.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{(s.companies as any)?.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{s.service_name}</p>
                      </div>
                      <span className="text-xs font-medium" style={{ color: '#D97706' }}>
                        {new Date(s.renewal_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
