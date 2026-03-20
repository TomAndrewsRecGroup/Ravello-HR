import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import {
  Briefcase, FolderOpen, LifeBuoy, AlertTriangle,
  TrendingUp, CheckCircle2, Clock, Lock,
} from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const supabase  = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch profile + company
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, companies(*)')
    .eq('id', user?.id ?? '')
    .single();

  const company = (profile as any)?.companies;
  const companyId: string | undefined = company?.id;

  // Parallel fetches — safe if no Supabase connected yet (returns empty)
  const [reqRes, docRes, ticketRes, complianceRes] = await Promise.all([
    supabase.from('requisitions').select('id,title,stage').eq('company_id', companyId ?? '').neq('stage','filled').neq('stage','cancelled'),
    supabase.from('documents').select('id,name,review_due_at').eq('company_id', companyId ?? '').order('review_due_at', { ascending: true }).limit(5),
    supabase.from('tickets').select('id,subject,status,priority').eq('company_id', companyId ?? '').neq('status','closed').order('created_at', { ascending: false }).limit(5),
    supabase.from('compliance_items').select('id,title,due_date,status').eq('company_id', companyId ?? '').neq('status','complete').order('due_date').limit(5),
  ]);

  const requisitions   = reqRes.data     ?? [];
  const documents      = docRes.data     ?? [];
  const tickets        = ticketRes.data  ?? [];
  const complianceItems = complianceRes.data ?? [];

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  function stageBadge(stage: string) {
    const map: Record<string, string> = {
      submitted:      'badge-submitted',
      in_progress:    'badge-inprogress',
      shortlist_ready:'badge-shortlist',
      interview:      'badge-interview',
      offer:          'badge-offer',
      filled:         'badge-filled',
    };
    return map[stage] ?? 'badge-pending';
  }
  function stageLabel(stage: string) {
    return stage.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }

  return (
    <>
      <Topbar
        title={`Good ${getGreeting()}, ${firstName}`}
        subtitle={company?.name ?? 'Ravello Portal'}
        actions={
          <Link href="/hiring/new" className="btn-cta btn-sm">
            + Submit a Role
          </Link>
        }
      />

      <main className="portal-page flex-1">

        {/* Stat row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Briefcase,     label: 'Active Roles',     val: requisitions.length,    href: '/hiring',    color: 'var(--purple)' },
            { icon: FolderOpen,    label: 'Documents',        val: documents.length,       href: '/documents', color: 'var(--blue)' },
            { icon: LifeBuoy,      label: 'Open Tickets',     val: tickets.length,         href: '/support',   color: 'var(--teal)' },
            { icon: AlertTriangle, label: 'Compliance Items', val: complianceItems.length, href: '#compliance',color: '#F59E0B' },
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

        <div className="grid lg:grid-cols-2 gap-6">

          {/* Hiring pipeline */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-[1rem]" style={{ color: 'var(--ink)' }}>
                Hiring Pipeline
              </h2>
              <Link href="/hiring" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>
                View all →
              </Link>
            </div>
            {requisitions.length === 0 ? (
              <div className="empty-state">
                <Briefcase size={24} />
                <p className="text-sm">No active roles</p>
                <Link href="/hiring/new" className="btn-cta btn-sm mt-2">Submit a Role</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {requisitions.slice(0, 6).map((r: any) => (
                  <Link
                    key={r.id}
                    href={`/hiring/${r.id}`}
                    className="flex items-center justify-between px-4 py-3 rounded-[10px] transition-colors hover:bg-[var(--surface-alt)]"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{r.title}</span>
                    <span className={`badge ${stageBadge(r.stage)}`}>{stageLabel(r.stage)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Open tickets */}
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
                  const due  = new Date(c.due_date);
                  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
                  const urgent = days <= 7;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-4 py-3 rounded-[10px]"
                      style={{ border: `1px solid ${urgent ? 'rgba(239,68,68,0.2)' : 'var(--line)'}`, background: urgent ? 'rgba(239,68,68,0.04)' : undefined }}
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

          {/* Recent documents */}
          <section className="card p-6">
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
              <div className="space-y-2">
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
                        {new Date(d.review_due_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
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
              { label: 'Leadership Development', desc: 'Structured support to improve team performance and decision-making.' },
              { label: 'Metrics & Analytics', desc: 'People data, attrition trends, and hiring performance in one view.' },
              { label: 'Compliance Calendar', desc: 'Upcoming compliance actions, review dates, and legal deadlines.' },
            ].map((f) => (
              <div
                key={f.label}
                className="rounded-[14px] p-5 flex flex-col gap-3 opacity-60"
                style={{ border: '1px dashed var(--line)', background: 'var(--surface-alt)' }}
              >
                <div className="flex items-center gap-2">
                  <Lock size={13} style={{ color: 'var(--ink-faint)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>{f.label}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{f.desc}</p>
                <a href="mailto:hello@ravellohr.co.uk?subject=Unlock: {f.label}" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>Speak to your account manager</a>
              </div>
            ))}
          </div>
        </section>

      </main>
    </>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
