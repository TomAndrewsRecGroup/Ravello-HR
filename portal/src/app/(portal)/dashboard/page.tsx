import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import FrictionAlert from '@/components/FrictionAlert';
import {
  Briefcase, FolderOpen, LifeBuoy, AlertTriangle,
  CheckCircle2, Clock, Lock, Zap, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Dashboard' };

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function priorityBadge(priority: string) {
  if (priority === 'high')   return { bg: 'rgba(220,38,38,0.1)',   text: '#991B1B', label: 'High' };
  if (priority === 'medium') return { bg: 'rgba(217,119,6,0.1)',   text: '#92400E', label: 'Medium' };
  return                            { bg: 'rgba(148,163,184,0.1)', text: '#64748B', label: 'Low' };
}

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, companies(*)')
    .eq('id', user?.id ?? '')
    .single();

  const company   = (profile as any)?.companies;
  const companyId: string | undefined = company?.id;

  const [reqRes, docRes, ticketRes, complianceRes, servicesRes, actionsRes] = await Promise.all([
    supabase
      .from('requisitions')
      .select('id,title,stage,created_at,friction_level,friction_recommendations,working_model,location')
      .eq('company_id', companyId ?? '')
      .neq('stage', 'filled')
      .neq('stage', 'cancelled')
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('id,name,review_due_at')
      .eq('company_id', companyId ?? '')
      .order('review_due_at', { ascending: true })
      .limit(5),
    supabase
      .from('tickets')
      .select('id,subject,status,priority')
      .eq('company_id', companyId ?? '')
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('compliance_items')
      .select('id,title,due_date,status')
      .eq('company_id', companyId ?? '')
      .neq('status', 'complete')
      .order('due_date')
      .limit(5),
    supabase
      .from('client_services')
      .select('id,service_name,service_tier,status')
      .eq('company_id', companyId ?? '')
      .eq('status', 'active'),
    supabase
      .from('actions')
      .select('*')
      .eq('company_id', companyId ?? '')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  ]);

  const requisitions    = reqRes.data      ?? [];
  const documents       = docRes.data      ?? [];
  const tickets         = ticketRes.data   ?? [];
  const complianceItems = complianceRes.data ?? [];
  const services        = servicesRes.data  ?? [];
  const actions         = actionsRes.data   ?? [];

  const firstName = (profile as any)?.full_name?.split(' ')[0] ?? 'there';

  // Roles with High or Critical friction
  const frictionAlerts = requisitions.filter(
    (r: any) => r.friction_level === 'High' || r.friction_level === 'Critical'
  );

  function stageBadge(stage: string) {
    const map: Record<string, string> = {
      submitted:       'badge-submitted',
      in_progress:     'badge-inprogress',
      shortlist_ready: 'badge-shortlist',
      interview:       'badge-interview',
      offer:           'badge-offer',
      filled:          'badge-filled',
    };
    return map[stage] ?? 'badge-pending';
  }

  return (
    <>
      <Topbar
        title={`Good ${getGreeting()}, ${firstName}`}
        subtitle={company?.name ?? 'The People Office Portal'}
        actions={
          <Link href="/hiring/new" className="btn-cta btn-sm">
            + Raise a Role
          </Link>
        }
      />

      <main className="portal-page flex-1">

        {/* ── Stat row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Briefcase,     label: 'Active Roles',     val: requisitions.length,    href: '/hiring',    color: 'var(--purple)' },
            { icon: FolderOpen,    label: 'Documents',        val: documents.length,       href: '/documents', color: 'var(--blue)' },
            { icon: LifeBuoy,      label: 'Open Tickets',     val: tickets.length,         href: '/support',   color: 'var(--teal)' },
            { icon: AlertTriangle, label: 'Compliance Items', val: complianceItems.length, href: '/compliance',color: '#F59E0B' },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="stat-card card-hover card">
              <div className="flex items-center justify-between mb-2">
                <s.icon size={16} style={{ color: s.color }} />
                <span className="text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>{s.label}</span>
              </div>
              <p className="font-display font-bold text-3xl" style={{ color: 'var(--ink)' }}>{s.val}</p>
            </Link>
          ))}
        </div>

        {/* ── Main grid ─────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Section 1 — Active Services */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                Active Services
              </h2>
            </div>
            {services.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
                Your service packages will appear here once your engagement is confirmed.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {services.map((s: any) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)', border: '1px solid rgba(124,58,237,0.16)' }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--purple)' }}
                    />
                    {s.service_name}
                    {s.service_tier ? ` — ${s.service_tier}` : ''}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Section 3 — Friction Alerts */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap size={15} style={{ color: 'var(--purple)' }} />
                <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                  Friction Alerts
                </h2>
              </div>
              {frictionAlerts.length > 0 && (
                <Link href="/hiring" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>
                  View all →
                </Link>
              )}
            </div>
            {frictionAlerts.length === 0 ? (
              <div className="empty-state py-6">
                <CheckCircle2 size={22} style={{ color: 'var(--teal)' }} />
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                  No friction alerts. All active roles are well-positioned.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {frictionAlerts.map((r: any) => (
                  <div
                    key={r.id}
                    className="rounded-[10px] px-4 py-3 flex items-start justify-between gap-4"
                    style={{ border: '1px solid rgba(217,119,6,0.25)', background: 'rgba(217,119,6,0.04)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{r.title}</p>
                      {r.friction_recommendations?.[0] && (
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                          {r.friction_recommendations[0]}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/hiring/${r.id}`}
                      className="flex-shrink-0 text-xs font-medium flex items-center gap-1"
                      style={{ color: 'var(--purple)' }}
                    >
                      View <ArrowRight size={11} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2 — Live Roles */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                Live Roles
              </h2>
              <Link href="/hiring" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>
                View all →
              </Link>
            </div>
            {requisitions.length === 0 ? (
              <div className="empty-state">
                <Briefcase size={24} />
                <p className="text-sm">No active roles</p>
                <Link href="/hiring/new" className="btn-cta btn-sm mt-2">Raise a Role</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {requisitions.slice(0, 6).map((r: any) => {
                  const isHighFriction = r.friction_level === 'High' || r.friction_level === 'Critical';
                  return (
                    <Link
                      key={r.id}
                      href={`/hiring/${r.id}`}
                      className="flex items-center justify-between px-4 py-3 rounded-[10px] transition-colors hover:bg-[var(--surface-alt)] gap-3"
                      style={{
                        border:     `1px solid ${isHighFriction ? 'rgba(217,119,6,0.3)' : 'var(--line)'}`,
                        background: isHighFriction ? 'rgba(217,119,6,0.03)' : undefined,
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{r.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                          {daysOpen(r.created_at)}d open
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <FrictionAlert level={r.friction_level} />
                        <span className={`badge ${stageBadge(r.stage)}`}>
                          {r.stage.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 4 — Outstanding Actions */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                Outstanding Actions
              </h2>
            </div>
            {actions.length === 0 ? (
              <div className="empty-state py-6">
                <CheckCircle2 size={22} style={{ color: 'var(--teal)' }} />
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No outstanding actions. You're up to date.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {actions.map((a: any) => {
                  const pb = priorityBadge(a.priority);
                  const inner = (
                    <div
                      key={a.id}
                      className="flex items-start justify-between gap-3 px-4 py-3 rounded-[10px]"
                      style={{ border: '1px solid var(--line)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{a.title}</p>
                        {a.description && (
                          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{a.description}</p>
                        )}
                      </div>
                      <span
                        className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: pb.bg, color: pb.text }}
                      >
                        {pb.label}
                      </span>
                    </div>
                  );

                  if (a.related_entity_id && a.related_entity_type === 'requisition') {
                    return (
                      <Link key={a.id} href={`/hiring/${a.related_entity_id}`} className="block hover:opacity-90 transition-opacity">
                        {inner}
                      </Link>
                    );
                  }
                  return <div key={a.id}>{inner}</div>;
                })}
              </div>
            )}
          </section>

          {/* Compliance / upcoming */}
          <section id="compliance" className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                Compliance &amp; Actions
              </h2>
            </div>
            {complianceItems.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={24} />
                <p className="text-sm">All clear — no upcoming items</p>
              </div>
            ) : (
              <div className="space-y-2">
                {complianceItems.map((c: any) => {
                  const due    = new Date(c.due_date);
                  const days   = Math.ceil((due.getTime() - Date.now()) / 86400000);
                  const urgent = days <= 7;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-4 py-3 rounded-[10px]"
                      style={{
                        border:     `1px solid ${urgent ? 'rgba(239,68,68,0.2)' : 'var(--line)'}`,
                        background: urgent ? 'rgba(239,68,68,0.04)' : undefined,
                      }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{c.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: urgent ? '#E05555' : 'var(--ink-faint)' }}>
                          {days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `Due in ${days}d`}
                        </p>
                      </div>
                      <span className={`badge ${c.status === 'overdue' ? 'badge-overdue' : urgent ? 'badge-high' : 'badge-pending'}`}>
                        {c.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* HR Support */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                HR Support
              </h2>
              <Link href="/support" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>
                View all →
              </Link>
            </div>
            {tickets.length === 0 ? (
              <div className="empty-state">
                <LifeBuoy size={24} />
                <p className="text-sm">No open tickets</p>
                <Link href="/support/new" className="btn-secondary btn-sm mt-2">Raise a query</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map((t: any) => (
                  <Link
                    key={t.id}
                    href={`/support/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 rounded-[10px] transition-colors hover:bg-[var(--surface-alt)]"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <span className="text-sm font-medium truncate max-w-[220px]" style={{ color: 'var(--ink)' }}>{t.subject}</span>
                    <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent Documents */}
          <section className="card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                Recent Documents
              </h2>
              <Link href="/documents" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>
                View all →
              </Link>
            </div>
            {documents.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={24} />
                <p className="text-sm">No documents uploaded yet</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {documents.map((d: any) => (
                  <Link
                    key={d.id}
                    href="/documents"
                    className="flex items-center justify-between px-4 py-3 rounded-[10px] transition-colors hover:bg-[var(--surface-alt)]"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <span className="text-sm truncate max-w-[220px]" style={{ color: 'var(--ink)' }}>{d.name}</span>
                    {d.review_due_at && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                        <Clock size={11} />
                        {new Date(d.review_due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* Locked feature tiles */}
        <section className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--ink-faint)' }}>Available with your plan</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: 'Leadership Development', desc: 'Structured support to improve team performance and decision-making.', href: null },
              { label: 'Metrics & Analytics',    desc: 'People data, attrition trends, and hiring performance in one view.',   href: '/metrics' },
              { label: 'Compliance Tracker',     desc: 'Manage upcoming compliance obligations, review dates, and deadlines.', href: '/compliance' },
            ].map((f) => (
              <div
                key={f.label}
                className="rounded-[14px] p-5 flex flex-col gap-3"
                style={{ border: `1px ${f.href ? 'solid' : 'dashed'} var(--line)`, background: 'var(--surface-alt)', opacity: f.href ? 1 : 0.6 }}
              >
                <div className="flex items-center gap-2">
                  {f.href
                    ? <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--purple)' }} />
                    : <Lock size={13} style={{ color: 'var(--ink-faint)' }} />}
                  <span className="text-xs font-semibold" style={{ color: f.href ? 'var(--ink)' : 'var(--ink-soft)' }}>{f.label}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{f.desc}</p>
                {f.href
                  ? <a href={f.href} className="text-xs font-medium" style={{ color: 'var(--purple)' }}>View {f.label} →</a>
                  : <a href={`mailto:hello@thepeopleoffice.co.uk?subject=Unlock: ${f.label}`} className="text-xs font-medium" style={{ color: 'var(--purple)' }}>Speak to your account manager</a>}
              </div>
            ))}
          </div>
        </section>

      </main>
    </>
  );
}
