import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
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
  const { user, profile, companyId } = await getSessionProfile();

  // Feature flags are already in the session cookie — use them to avoid a waterfall
  const { featureFlags: sessionFlags } = await getSessionProfile();
  const flagsFromSession: Record<string, boolean> = sessionFlags ?? {};

  // Single parallel batch — no waterfall
  const [{ data: company }, { data: fullProfile },
    reqRes, docRes, ticketRes, complianceRes, servicesRes, actionsRes,
    trainingRes, absenceRes, frictionRes] = await Promise.all([
    supabase.from('companies').select('id,name,feature_flags').eq('id', companyId).single(),
    supabase.from('profiles').select('full_name').eq('id', user?.id ?? '').single(),
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
      .select('id,title,description,priority,status,due_date,created_at')
      .eq('company_id', companyId ?? '')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    // LEAD module — use session flags (available immediately, no waterfall)
    flagsFromSession.lead !== false
      ? supabase.from('training_needs').select('id,title,status,employee_name').eq('company_id', companyId ?? '').eq('status', 'open').limit(4)
      : Promise.resolve({ data: null }),
    // PROTECT module
    flagsFromSession.protect !== false
      ? supabase.from('absence_records').select('id,employee_name,absence_type,start_date,status').eq('company_id', companyId ?? '').eq('status', 'pending').limit(4)
      : Promise.resolve({ data: null }),
    // Company friction assessment
    supabase.from('company_assessments').select('overall_band,top_signals,confidence,created_at').eq('company_id', companyId ?? '').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const requisitions    = reqRes.data      ?? [];
  const documents       = docRes.data      ?? [];
  const tickets         = ticketRes.data   ?? [];
  const complianceItems = complianceRes.data ?? [];
  const services        = servicesRes.data  ?? [];
  const actions         = actionsRes.data   ?? [];
  const openTraining    = trainingRes.data  ?? [];
  const pendingAbsences = absenceRes.data   ?? [];
  const frictionAssessment = frictionRes.data ?? null;

  const firstName = (fullProfile as any)?.full_name?.split(' ')[0] ?? 'there';

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

  // Count items needing attention
  const attentionCount = actions.length + frictionAlerts.length + complianceItems.filter((c: any) => c.status === 'overdue').length;

  return (
    <>
      <Topbar
        title={`Good ${getGreeting()}, ${firstName}`}
        subtitle={company?.name ?? ''}
        actions={
          <Link href="/hire/hiring/new" className="btn-cta btn-sm">
            + Raise a Role
          </Link>
        }
      />

      <main className="portal-page flex-1">

        {/* ── Hero context — one sentence summary ────────────────── */}
        <div className="mb-6 p-5 rounded-xl" style={{ background: 'var(--gradient-soft)' }}>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>
            You have <strong style={{ color: 'var(--purple)' }}>{requisitions.length} active role{requisitions.length !== 1 ? 's' : ''}</strong>
            {tickets.length > 0 && <>, <strong>{tickets.length} open ticket{tickets.length !== 1 ? 's' : ''}</strong></>}
            {actions.length > 0 && <>, and <strong style={{ color: 'var(--warning)' }}>{actions.length} action{actions.length !== 1 ? 's' : ''} needing attention</strong></>}
            .
            {attentionCount === 0 && <span style={{ color: 'var(--success)' }}> Everything looks good.</span>}
          </p>
        </div>

        {/* ── Stat pills — compact, scannable ────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { label: 'Active Roles',     val: requisitions.length,    href: '/hire/hiring',         color: 'var(--purple)' },
            { label: 'Open Tickets',     val: tickets.length,         href: '/support',             color: 'var(--warning)' },
            { label: 'Compliance',       val: complianceItems.length, href: '/protect/compliance',  color: 'var(--danger)' },
            { label: 'Documents',        val: documents.length,       href: '/lead/documents',      color: 'var(--blue)' },
            { label: 'Actions',          val: actions.length,         href: '/protect/actions',     color: 'var(--ink-soft)' },
          ].map(s => (
            <Link
              key={s.label}
              href={s.href}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white"
              style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: s.val > 0 ? s.color : 'var(--line)' }} />
              {s.label}
              <span className="font-semibold" style={{ color: s.val > 0 ? s.color : 'var(--ink-faint)' }}>{s.val}</span>
            </Link>
          ))}
        </div>

        {/* ── Company Friction Score ─────────────────────────────────── */}
        {(company?.feature_flags ?? flagsFromSession).friction_lens !== false && (
          <div className="mb-6">
            {frictionAssessment ? (
              <Link href="/hire/friction-lens" className="card p-5 flex items-center gap-5 hover:shadow-md transition-shadow">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: frictionAssessment.overall_band === 'Low Friction' ? 'rgba(52,211,153,0.12)' :
                                frictionAssessment.overall_band === 'High Friction' ? 'rgba(217,68,68,0.08)' :
                                'rgba(245,158,11,0.10)',
                  }}
                >
                  <Zap size={20} style={{
                    color: frictionAssessment.overall_band === 'Low Friction' ? '#047857' :
                           frictionAssessment.overall_band === 'High Friction' ? '#B02020' : '#8A5500',
                  }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Company Friction Score</p>
                    <span
                      className="badge text-xs"
                      style={
                        frictionAssessment.overall_band === 'Low Friction' ? { background: 'rgba(52,211,153,0.14)', color: '#047857' } :
                        frictionAssessment.overall_band === 'High Friction' ? { background: 'rgba(217,68,68,0.10)', color: '#B02020' } :
                        { background: 'rgba(245,158,11,0.15)', color: '#8A5500' }
                      }
                    >
                      {frictionAssessment.overall_band}
                    </span>
                  </div>
                  {frictionAssessment.top_signals?.[0] && (
                    <p className="text-xs truncate" style={{ color: 'var(--ink-faint)' }}>{frictionAssessment.top_signals[0]}</p>
                  )}
                </div>
                <ArrowRight size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
              </Link>
            ) : (
              <Link href="/hire/friction-lens" className="card p-5 flex items-center gap-5 hover:shadow-md transition-shadow" style={{ borderLeft: '3px solid var(--purple)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.08)' }}>
                  <Zap size={20} style={{ color: 'var(--purple)' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Get your Company Friction Score</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>Answer questions about your HR operations to see where friction is slowing you down.</p>
                </div>
                <ArrowRight size={14} style={{ color: 'var(--purple)', flexShrink: 0 }} />
              </Link>
            )}
          </div>
        )}

        {/* ── Needs Attention — actionable row ─────────────────────── */}
        {(actions.length > 0 || frictionAlerts.length > 0) && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Needs Your Attention</h2>
              {actions.length > 0 && (
                <Link href="/protect/actions" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>View all →</Link>
              )}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
              {actions.slice(0, 6).map((a: any) => (
                <div key={a.id} className="card p-4 flex-shrink-0 w-[260px]" style={{ scrollSnapAlign: 'start', borderLeft: `3px solid ${a.priority === 'high' ? 'var(--danger)' : a.priority === 'medium' ? 'var(--warning)' : 'var(--line)'}` }}>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{a.title}</p>
                  {a.description && <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--ink-faint)' }}>{a.description}</p>}
                </div>
              ))}
              {frictionAlerts.slice(0, 3).map((r: any) => (
                <Link key={r.id} href={`/hiring/${r.id}`} className="card p-4 flex-shrink-0 w-[260px] hover:shadow-md transition-shadow" style={{ scrollSnapAlign: 'start', borderLeft: '3px solid var(--warning)' }}>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{r.title}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>High friction — review details</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Live Roles — horizontal card row ──────────────────────── */}
        {requisitions.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Live Roles</h2>
              <Link href="/hire/hiring" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>View all →</Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
              {requisitions.slice(0, 8).map((r: any) => (
                <Link key={r.id} href={`/hiring/${r.id}`} className="card p-4 flex-shrink-0 w-[240px] hover:shadow-md transition-all" style={{ scrollSnapAlign: 'start' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stageBadge(r.stage)}`}>{r.stage.replace(/_/g, ' ')}</span>
                    <FrictionAlert level={r.friction_level} />
                  </div>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{r.title}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{daysOpen(r.created_at)}d open</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Two-column: Compliance + Tickets ──────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-5 mb-6">
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Compliance</h2>
              <Link href="/protect/compliance" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>View all →</Link>
            </div>
            {complianceItems.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--ink-faint)' }}>All clear — no upcoming items</p>
            ) : (
              <div className="space-y-1.5">
                {complianceItems.slice(0, 5).map((c: any) => {
                  const due = new Date(c.due_date);
                  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
                  return (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: days <= 7 ? 'rgba(239,68,68,0.04)' : 'var(--surface-soft)' }}>
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{c.title}</p>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: days < 0 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--success)' }} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>HR Support</h2>
              <Link href="/support" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>View all →</Link>
            </div>
            {tickets.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No open tickets</p>
                <Link href="/support/new" className="text-xs font-medium mt-1 inline-block" style={{ color: 'var(--purple)' }}>Raise a query →</Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tickets.slice(0, 5).map((t: any) => (
                  <Link key={t.id} href={`/support/${t.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--surface-soft)]" style={{ background: 'var(--surface-soft)' }}>
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--ink)', maxWidth: 200 }}>{t.subject}</span>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.priority === 'urgent' ? 'var(--danger)' : t.priority === 'high' ? 'var(--warning)' : 'var(--ink-faint)' }} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Services + Documents — compact ──────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-5">
          {services.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
                Active Services
              </h2>
              <div className="flex flex-wrap gap-2">
                {services.map((s: any) => (
                  <span key={s.id} className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--purple)', border: '1px solid rgba(124,58,237,0.12)' }}>
                    {s.service_name}{s.service_tier ? ` — ${s.service_tier}` : ''}
                  </span>
                ))}
              </div>
            </section>
          )}

          {documents.length > 0 && (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Recent Documents</h2>
                <Link href="/lead/documents" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>View all →</Link>
              </div>
              <div className="space-y-1.5">
                {documents.slice(0, 4).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--ink)', maxWidth: 200 }}>{d.name}</span>
                    {d.review_due_at && (
                      <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                        {new Date(d.review_due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Remove old grid content below — replaced above ──────── */}
        {/* Old content removed — was: Active Services, Friction Alerts,
            Live Roles, Outstanding Actions, Compliance, HR Support,
            LEAD/PROTECT modules, Recent Documents, Locked features */}
      </main>
    </>
  );
}

