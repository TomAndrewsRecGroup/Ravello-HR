import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import {
  Map, CheckCircle2, Circle, Clock,
  Briefcase, BookOpen, ShieldCheck, TrendingUp, Users, BarChart3,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Roadmap' };
export const revalidate = 60;

type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type Track   = 'HIRE' | 'LEAD' | 'PROTECT';

// HIRE = recruitment / talent acquisition (Business pillar in our framing)
// LEAD = people development / training (HR pillar)
// PROTECT = compliance / risk (Data + Risk pillar)
const TRACK_META: Record<Track, { label: string; pillar: string; icon: typeof Briefcase; bg: string; text: string; border: string }> = {
  HIRE:    { label: 'Hire',    pillar: 'Business', icon: Briefcase,    bg: 'rgba(124,58,237,0.08)',  text: 'var(--purple)', border: 'rgba(124,58,237,0.2)' },
  LEAD:    { label: 'Lead',    pillar: 'HR',       icon: BookOpen,     bg: 'rgba(20,184,166,0.08)',  text: 'var(--teal)',   border: 'rgba(20,184,166,0.2)' },
  PROTECT: { label: 'Protect', pillar: 'Data',     icon: ShieldCheck,  bg: 'rgba(59,130,246,0.08)',  text: 'var(--blue)',   border: 'rgba(59,130,246,0.2)' },
};

const STATUS_ICON: Record<string, React.ElementType> = {
  complete:    CheckCircle2,
  in_progress: Clock,
  pending:     Circle,
};

const STATUS_COLOR: Record<string, string> = {
  complete:    'var(--teal)',
  in_progress: 'var(--purple)',
  pending:     'var(--ink-faint)',
};

function currentYear() {
  return new Date().getFullYear();
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export default async function AdminRoadmapPage() {
  const supabase = createServerSupabaseClient();

  const [milestonesRes, companiesRes] = await Promise.all([
    supabase
      .from('milestones')
      .select('id,company_id,track,pillar,title,description,quarter,due_date,status,owner,sort_order,companies(id,slug,name)')
      .order('quarter')
      .order('track')
      .limit(2000),
    supabase
      .from('companies')
      .select('id,slug,name')
      .eq('active', true)
      .order('name'),
  ]);

  const milestones = milestonesRes.data ?? [];
  const companies  = companiesRes.data  ?? [];

  // ── Aggregate metrics ─────────────────────────────────────────
  const totalMilestones = milestones.length;
  const completed       = milestones.filter((m: any) => m.status === 'complete').length;
  const inProgress      = milestones.filter((m: any) => m.status === 'in_progress').length;
  const pending         = milestones.filter((m: any) => m.status === 'pending').length;
  const completionPct   = totalMilestones === 0 ? 0 : Math.round((completed / totalMilestones) * 100);

  // Three-way pillar breakdown — derived from track for now (one
  // track = one pillar mapping in TRACK_META). When the milestones
  // table grows a richer pillar enum this read can switch to it.
  const byPillar = (['HR', 'Business', 'Data'] as const).map(p => {
    const tracks = (Object.keys(TRACK_META) as Track[]).filter(t => TRACK_META[t].pillar === p);
    const items  = milestones.filter((m: any) => tracks.includes(m.track as Track));
    const done   = items.filter((m: any) => m.status === 'complete').length;
    return {
      pillar: p,
      tracks,
      total:  items.length,
      done,
      pct:    items.length === 0 ? 0 : Math.round((done / items.length) * 100),
    };
  });

  // Group by company
  const byCompany: Record<string, { slug: string | null; name: string; milestones: any[] }> = {};
  for (const m of milestones) {
    const cid  = (m.companies as any)?.id ?? 'unknown';
    const slug = (m.companies as any)?.slug ?? null;
    const name = (m.companies as any)?.name ?? 'Unknown';
    if (!byCompany[cid]) byCompany[cid] = { slug, name, milestones: [] };
    byCompany[cid].milestones.push(m);
  }

  const clientsWithMilestones = new Set(Object.keys(byCompany));
  const clientsWithout = companies.filter((c: any) => !clientsWithMilestones.has(c.id));
  const totalClients = companies.length;
  const clientsLive  = clientsWithMilestones.size;

  return (
    <>
      <AdminTopbar
        title="Roadmap"
        subtitle={`Strategic delivery across ${totalClients} active client${totalClients === 1 ? '' : 's'} · ${currentYear()}`}
      />
      <main className="admin-page flex-1 space-y-6">

        {/* ── Hero rollup ──────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--purple)' }}>Programme delivery</p>
              <p className="font-display text-3xl font-bold mt-1" style={{ color: 'var(--ink)' }}>
                {completionPct}<span className="text-base font-medium" style={{ color: 'var(--ink-faint)' }}>%</span>
                <span className="text-sm font-medium ml-2" style={{ color: 'var(--ink-soft)' }}>complete</span>
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                {completed} of {totalMilestones} milestones across {clientsLive} client{clientsLive === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium" style={{ color: 'var(--teal)' }}>{completed} done</span>
              <span className="text-xs font-medium" style={{ color: 'var(--purple)' }}>{inProgress} in progress</span>
              <span className="text-xs font-medium" style={{ color: 'var(--ink-faint)' }}>{pending} pending</span>
            </div>
          </div>

          {/* Stacked progress bar */}
          {totalMilestones > 0 && (
            <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--line)' }}>
              <div style={{ width: `${(completed / totalMilestones) * 100}%`, background: 'var(--teal)' }} />
              <div style={{ width: `${(inProgress / totalMilestones) * 100}%`, background: 'var(--purple)' }} />
              <div style={{ width: `${(pending / totalMilestones) * 100}%`, background: 'var(--ink-faint)', opacity: 0.3 }} />
            </div>
          )}
        </div>

        {/* ── Pillar mix ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {byPillar.map(p => {
            const Icon = p.pillar === 'HR' ? Users : p.pillar === 'Business' ? TrendingUp : BarChart3;
            const accent = p.pillar === 'HR' ? 'var(--teal)' : p.pillar === 'Business' ? 'var(--purple)' : 'var(--blue)';
            const bg     = p.pillar === 'HR' ? 'rgba(20,184,166,0.08)' : p.pillar === 'Business' ? 'rgba(124,58,237,0.08)' : 'rgba(59,130,246,0.08)';
            return (
              <div key={p.pillar} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: bg, color: accent }}>
                      <Icon size={17} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{p.pillar}</p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{p.tracks.join(' · ')}</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold font-display" style={{ color: accent }}>{p.pct}%</p>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--line)' }}>
                  <div className="h-full" style={{ width: `${p.pct}%`, background: accent }} />
                </div>
                <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                  {p.done} of {p.total} milestone{p.total === 1 ? '' : 's'} complete
                </p>
              </div>
            );
          })}
        </div>

        {/* ── Per-client roadmaps ─────────────────────────────── */}
        <div className="space-y-5">
          {Object.entries(byCompany).map(([cid, client]) => {
            const total   = client.milestones.length;
            const done    = client.milestones.filter((m: any) => m.status === 'complete').length;
            const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

            const byQuarter: Record<string, any[]> = {};
            for (const m of client.milestones) {
              const q = m.quarter ?? 'Q1';
              if (!byQuarter[q]) byQuarter[q] = [];
              byQuarter[q].push(m);
            }

            return (
              <section key={cid} className="card overflow-hidden">
                <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
                  <div className="flex items-center gap-3">
                    <h2 className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>{client.name}</h2>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--purple)' }}>
                      {pct}% delivered
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                      <span style={{ color: 'var(--teal)' }}>{done}</span>
                      <span>/</span>
                      <span>{total}</span>
                    </div>
                    <Link prefetch={false} href={`/clients/${client.slug ?? cid}`} className="text-xs font-medium hover:underline" style={{ color: 'var(--purple)' }}>
                      View client →
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x" style={{ borderColor: 'var(--line)' }}>
                  {QUARTERS.map((q) => {
                    const qMilestones = byQuarter[q] ?? [];
                    return (
                      <div key={q} className="p-4 min-h-[120px]">
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>
                          {q} {currentYear()}
                        </p>
                        {qMilestones.length === 0 ? (
                          <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>—</p>
                        ) : (
                          <div className="space-y-3">
                            {(['HIRE', 'LEAD', 'PROTECT'] as Track[]).map((track) => {
                              const trackItems = qMilestones.filter((m: any) => m.track === track);
                              if (trackItems.length === 0) return null;
                              const meta = TRACK_META[track];
                              const TIcon = meta.icon;
                              return (
                                <div key={track}>
                                  <div className="flex items-center gap-1 mb-1.5">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}>
                                      <TIcon size={9} /> {meta.label}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {trackItems.map((m: any) => {
                                      const StatusIcon  = STATUS_ICON[m.status] ?? Circle;
                                      const statusColor = STATUS_COLOR[m.status] ?? 'var(--ink-faint)';
                                      return (
                                        <div key={m.id} className="flex items-start gap-1.5" title={m.description ?? undefined}>
                                          <StatusIcon size={11} className="flex-shrink-0 mt-[3px]" style={{ color: statusColor }} />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs leading-snug" style={{ color: m.status === 'complete' ? 'var(--ink-faint)' : 'var(--ink-soft)', textDecoration: m.status === 'complete' ? 'line-through' : 'none' }}>
                                              {m.title}
                                            </p>
                                            {(m.due_date || m.owner) && (
                                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                                                {m.due_date && fmtDate(m.due_date)}
                                                {m.due_date && m.owner && ' · '}
                                                {m.owner}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {clientsWithout.length > 0 && (
            <section className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>
                Clients without a roadmap ({clientsWithout.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {clientsWithout.map((c: any) => (
                  <Link prefetch={false} key={c.id} href={`/clients/${c.slug ?? c.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:opacity-80" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
                    <Map size={11} />
                    {c.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {milestones.length === 0 && clientsWithout.length === 0 && (
            <div className="card flex flex-col items-center gap-3 py-16">
              <Map size={32} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
                No milestones yet. Add milestones from a client&rsquo;s Roadmap tab.
              </p>
            </div>
          )}
        </div>

      </main>
    </>
  );
}
