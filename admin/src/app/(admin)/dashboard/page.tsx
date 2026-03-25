import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { Building2, Users, Briefcase, LifeBuoy } from 'lucide-react';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AdminDashboardPage() {
  const supabase = createServerSupabaseClient();

  const [compRes, userRes, reqRes, ticketRes] = await Promise.all([
    supabase.from('companies').select('id,name,active').order('name'),
    supabase.from('profiles').select('id,role').neq('role','ravello_admin'),
    supabase.from('requisitions').select('id,title,stage,companies(name)').neq('stage','filled').neq('stage','cancelled').order('created_at',{ascending:false}).limit(10),
    supabase.from('tickets').select('id,subject,status,priority,companies(name)').neq('status','closed').order('created_at',{ascending:false}).limit(10),
  ]);

  const companies  = compRes.data  ?? [];
  const users      = userRes.data  ?? [];
  const reqs       = reqRes.data   ?? [];
  const tickets    = ticketRes.data ?? [];
  const active     = companies.filter((c: any) => c.active).length;

  const stageBadge: Record<string,string> = { submitted:'badge-submitted',in_progress:'badge-inprogress',shortlist_ready:'badge-shortlist',interview:'badge-interview',offer:'badge-offer',filled:'badge-filled',cancelled:'badge-cancelled' };
  const prioBadge:  Record<string,string> = { urgent:'badge-urgent',high:'badge-high',normal:'badge-normal',low:'badge-normal' };

  return (
    <>
      <AdminTopbar
        title="Admin Dashboard"
        subtitle="The People Office — internal operations"
        actions={<Link href="/clients/new" className="btn-cta btn-sm">+ New Client</Link>}
      />
      <main className="admin-page flex-1">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Building2, label: 'Active Clients', val: active,         href: '/clients',   color: 'var(--purple)' },
            { icon: Users,     label: 'Client Users',   val: users.length,   href: '/users',     color: 'var(--blue)' },
            { icon: Briefcase, label: 'Active Roles',   val: reqs.length,    href: '/hiring',    color: 'var(--teal)' },
            { icon: LifeBuoy,  label: 'Open Tickets',   val: tickets.length, href: '/support',   color: '#F59E0B' },
          ].map(s => (
            <Link key={s.label} href={s.href} className="stat-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <s.icon size={15} style={{ color: s.color }} />
                <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{s.label}</span>
              </div>
              <p className="font-display font-bold text-3xl" style={{ color: 'var(--ink)' }}>{s.val}</p>
            </Link>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* Active roles */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Active Hiring Roles</h2>
              <Link href="/hiring" className="text-xs" style={{ color: 'var(--purple)' }}>All →</Link>
            </div>
            {reqs.length === 0 ? <p className="text-sm text-center py-8" style={{ color: 'var(--ink-faint)' }}>No active roles</p> : (
              <div className="space-y-2">
                {reqs.slice(0,8).map((r: any) => (
                  <Link key={r.id} href={`/hiring/${r.id}`} className="flex items-center justify-between px-3 py-2.5 rounded-[8px] hover:bg-[var(--surface-alt)] transition-colors">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{r.title}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.companies?.name}</p>
                    </div>
                    <span className={`badge ${stageBadge[r.stage]}`}>{r.stage.replace(/_/g,' ')}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Open tickets */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Open Support Tickets</h2>
              <Link href="/support" className="text-xs" style={{ color: 'var(--purple)' }}>All →</Link>
            </div>
            {tickets.length === 0 ? <p className="text-sm text-center py-8" style={{ color: 'var(--ink-faint)' }}>No open tickets</p> : (
              <div className="space-y-2">
                {tickets.slice(0,8).map((t: any) => (
                  <Link key={t.id} href={`/support/${t.id}`} className="flex items-center justify-between px-3 py-2.5 rounded-[8px] hover:bg-[var(--surface-alt)] transition-colors">
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]" style={{ color: 'var(--ink)' }}>{t.subject}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{t.companies?.name}</p>
                    </div>
                    <span className={`badge ${prioBadge[t.priority]}`}>{t.priority}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
