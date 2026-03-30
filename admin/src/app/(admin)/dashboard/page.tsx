import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import {
  Building2, Users, Briefcase, LifeBuoy,
  AlertTriangle, Clock, FileWarning, UserX, Gauge,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Dashboard' };
export const revalidate = 30; // cache page for 30s — revalidates in background

export default async function AdminDashboardPage() {
  const supabase = createServerSupabaseClient();

  const today   = new Date();
  const in30    = new Date(today); in30.setDate(today.getDate() + 30);
  const todayISO = today.toISOString();
  const in30ISO  = in30.toISOString();

  const [
    compRes, userRes, reqRes, ticketRes,
    overdueComplianceRes, expDocsRes, pendingAbsenceRes, serviceReqRes,
    highFrictionRes, unassessedRes,
  ] = await Promise.all([
    supabase.from('companies').select('id,name,active').order('name'),
    supabase.from('profiles').select('id,role').neq('role', 'tps_admin'),
    supabase.from('requisitions')
      .select('id,title,stage,companies(name)')
      .neq('stage', 'filled').neq('stage', 'cancelled')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('tickets')
      .select('id,subject,status,priority,companies(name)')
      .neq('status', 'closed')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('compliance_items')
      .select('id,title,due_date,companies(name)')
      .eq('status', 'overdue')
      .order('due_date')
      .limit(8),
    supabase.from('employee_documents')
      .select('id,document_type,employee_name,expiry_date,companies(name)')
      .lte('expiry_date', in30ISO)
      .gte('expiry_date', todayISO)
      .order('expiry_date')
      .limit(8),
    supabase.from('absence_records')
      .select('id,employee_name,absence_type,start_date,companies(name)')
      .eq('status', 'pending')
      .order('start_date')
      .limit(8),
    supabase.from('service_requests')
      .select('id,subject,urgency,status,companies(name)')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('companies')
      .select('id,name,friction_band')
      .eq('friction_band', 'High Friction')
      .eq('active', true),
    supabase.from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .is('friction_band', null),
  ]);

  const companies      = compRes.data           ?? [];
  const users          = userRes.data           ?? [];
  const reqs           = reqRes.data            ?? [];
  const tickets        = ticketRes.data         ?? [];
  const overdueComp    = overdueComplianceRes.data ?? [];
  const expiringDocs   = expDocsRes.data        ?? [];
  const pendingAbsence = pendingAbsenceRes.data ?? [];
  const serviceReqs    = serviceReqRes.data     ?? [];
  const highFriction   = highFrictionRes.data   ?? [];
  const unassessedCount = unassessedRes.count   ?? 0;
  const active         = companies.filter((c: any) => c.active).length;

  const stageBadge: Record<string, string> = {
    submitted: 'badge-submitted', in_progress: 'badge-inprogress',
    shortlist_ready: 'badge-shortlist', interview: 'badge-interview',
    offer: 'badge-offer', filled: 'badge-filled', cancelled: 'badge-cancelled',
  };
  const prioBadge: Record<string, string> = {
    urgent: 'badge-urgent', high: 'badge-high', normal: 'badge-normal', low: 'badge-normal',
  };

  const alertCount = overdueComp.length + expiringDocs.length + pendingAbsence.length;

  return (
    <>
      <AdminTopbar
        title="Admin Dashboard"
        subtitle="The People Office — internal operations"
        actions={<Link href="/clients/new" className="btn-cta btn-sm">+ New Client</Link>}
      />
      <main className="admin-page flex-1">

        {/* Stats — with mesh background */}
        <div className="relative mb-8">
          <div className="app-mesh" style={{ opacity: 0.6 }} />
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Building2,     label: 'Active Clients', val: active,         href: '/clients',  color: 'var(--purple)' },
              { icon: Users,         label: 'Client Users',   val: users.length,   href: '/users',    color: 'var(--blue)' },
              { icon: Briefcase,     label: 'Active Roles',   val: reqs.length,    href: '/hiring',   color: '#14B8A6' },
              { icon: LifeBuoy,      label: 'Open Tickets',   val: tickets.length, href: '/support',  color: '#F59E0B' },
            ].map(s => (
              <Link key={s.label} href={s.href} className="card-glass p-6 flex flex-col gap-1.5 hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-2">
                  <s.icon size={15} style={{ color: s.color }} />
                  <span className="eyebrow" style={{ fontSize: '10px' }}>{s.label}</span>
                </div>
                <p className="font-display font-bold text-3xl text-gradient">{s.val}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* PROTECT Alerts banner */}
        {alertCount > 0 && (
          <div
            className="card p-4 mb-6 flex items-center gap-3"
            style={{ borderLeft: '3px solid var(--red)', background: 'rgba(217,68,68,0.04)' }}
          >
            <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {alertCount} PROTECT alert{alertCount !== 1 ? 's' : ''} require attention —
              {overdueComp.length > 0 && ` ${overdueComp.length} overdue compliance items,`}
              {expiringDocs.length > 0 && ` ${expiringDocs.length} documents expiring within 30 days,`}
              {pendingAbsence.length > 0 && ` ${pendingAbsence.length} pending absence requests`}
            </p>
            <Link href="/compliance" className="btn-secondary btn-sm ml-auto" style={{ flexShrink: 0 }}>
              View Compliance
            </Link>
          </div>
        )}

        {/* Friction Health */}
        {(highFriction.length > 0 || unassessedCount > 0) && (
          <div className="card p-4 mb-6 flex items-center gap-3" style={{ borderLeft: '3px solid var(--purple)', background: 'rgba(124,58,237,0.03)' }}>
            <Gauge size={16} style={{ color: 'var(--purple)', flexShrink: 0 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Company Friction Health —
              {highFriction.length > 0 && (
                <span style={{ color: 'var(--red)' }}> {highFriction.length} high friction ({highFriction.map((c: any) => c.name).join(', ')})</span>
              )}
              {unassessedCount > 0 && (
                <span style={{ color: 'var(--ink-faint)' }}> · {unassessedCount} never assessed</span>
              )}
            </p>
            <Link href="/clients" className="btn-secondary btn-sm ml-auto" style={{ flexShrink: 0 }}>View Clients</Link>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Active roles */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Active Hiring Roles</h2>
                <span className="accent-line mt-1.5" />
              </div>
              <Link href="/hiring" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>All →</Link>
            </div>
            {reqs.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--ink-faint)' }}>No active roles</p>
            ) : (
              <div className="space-y-2">
                {reqs.slice(0, 8).map((r: any) => (
                  <Link key={r.id} href={`/hiring/${r.id}`} className="flex items-center justify-between px-3 py-2.5 rounded-[8px] hover:bg-[var(--surface-alt)] transition-colors">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{r.title}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{(r.companies as any)?.name}</p>
                    </div>
                    <span className={`badge ${stageBadge[r.stage]}`}>{r.stage.replace(/_/g, ' ')}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Open tickets */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Open Support Tickets</h2>
                <span className="accent-line mt-1.5" />
              </div>
              <Link href="/support" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>All →</Link>
            </div>
            {tickets.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--ink-faint)' }}>No open tickets</p>
            ) : (
              <div className="space-y-2">
                {tickets.slice(0, 8).map((t: any) => (
                  <Link key={t.id} href={`/support/${t.id}`} className="flex items-center justify-between px-3 py-2.5 rounded-[8px] hover:bg-[var(--surface-alt)] transition-colors">
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]" style={{ color: 'var(--ink)' }}>{t.subject}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{(t.companies as any)?.name}</p>
                    </div>
                    <span className={`badge ${prioBadge[t.priority]}`}>{t.priority}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Overdue compliance */}
          {overdueComp.length > 0 && (
            <section className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={14} style={{ color: 'var(--red)' }} />
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Overdue Compliance</h2>
                <Link href="/compliance" className="text-xs ml-auto" style={{ color: 'var(--purple)' }}>All →</Link>
              </div>
              <div className="space-y-2">
                {overdueComp.map((c: any) => (
                  <div key={c.id} className="px-3 py-2.5 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.05)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{c.title}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {(c.companies as any)?.name} · Due {new Date(c.due_date).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Expiring documents */}
          {expiringDocs.length > 0 && (
            <section className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileWarning size={14} style={{ color: '#F59E0B' }} />
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Docs Expiring Soon</h2>
                <Link href="/compliance" className="text-xs ml-auto" style={{ color: 'var(--purple)' }}>All →</Link>
              </div>
              <div className="space-y-2">
                {expiringDocs.map((d: any) => (
                  <div key={d.id} className="px-3 py-2.5 rounded-[8px]" style={{ background: 'rgba(245,158,11,0.05)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{d.employee_name}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {d.document_type} · {(d.companies as any)?.name} · expires {new Date(d.expiry_date).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pending absences */}
          {pendingAbsence.length > 0 && (
            <section className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserX size={14} style={{ color: 'var(--blue)' }} />
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Pending Absence Requests</h2>
              </div>
              <div className="space-y-2">
                {pendingAbsence.map((a: any) => (
                  <div key={a.id} className="px-3 py-2.5 rounded-[8px]" style={{ background: 'rgba(59,111,255,0.05)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{a.employee_name}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {a.absence_type} · {(a.companies as any)?.name} · from {new Date(a.start_date).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Service requests */}
          {serviceReqs.length > 0 && (
            <section className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} style={{ color: 'var(--teal)' }} />
                <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Open Service Requests</h2>
                <Link href="/requests" className="text-xs ml-auto" style={{ color: 'var(--purple)' }}>All →</Link>
              </div>
              <div className="space-y-2">
                {serviceReqs.map((sr: any) => (
                  <div key={sr.id} className="flex items-center justify-between px-3 py-2.5 rounded-[8px]" style={{ background: 'var(--surface-alt)' }}>
                    <div>
                      <p className="text-sm font-medium truncate max-w-[180px]" style={{ color: 'var(--ink)' }}>{sr.subject}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{(sr.companies as any)?.name}</p>
                    </div>
                    <span className={`badge ${prioBadge[sr.urgency] ?? ''}`}>{sr.urgency}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

      </main>
    </>
  );
}
