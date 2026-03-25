import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { Map, CheckCircle2, Circle, Clock } from 'lucide-react';

export const metadata: Metadata = { title: 'Roadmap' };

type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type Track   = 'HIRE' | 'LEAD' | 'PROTECT';

const TRACK_COLORS: Record<Track, { bg: string; text: string; border: string }> = {
  HIRE:    { bg: 'rgba(124,58,237,0.08)',  text: 'var(--purple)', border: 'rgba(124,58,237,0.2)' },
  LEAD:    { bg: 'rgba(20,184,166,0.08)',  text: 'var(--teal)',   border: 'rgba(20,184,166,0.2)' },
  PROTECT: { bg: 'rgba(59,130,246,0.08)', text: 'var(--blue)',   border: 'rgba(59,130,246,0.2)' },
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

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export default async function AdminRoadmapPage() {
  const supabase = createServerSupabaseClient();

  const [milestonesRes, companiesRes] = await Promise.all([
    supabase
      .from('milestones')
      .select('*, companies(id,name)')
      .order('quarter')
      .order('track'),
    supabase
      .from('companies')
      .select('id,name')
      .eq('active', true)
      .order('name'),
  ]);

  const milestones  = milestonesRes.data  ?? [];
  const companies   = companiesRes.data   ?? [];

  // Group by company
  const byCompany: Record<string, { name: string; milestones: any[] }> = {};
  for (const m of milestones) {
    const cid  = (m.companies as any)?.id ?? 'unknown';
    const name = (m.companies as any)?.name ?? 'Unknown';
    if (!byCompany[cid]) byCompany[cid] = { name, milestones: [] };
    byCompany[cid].milestones.push(m);
  }

  // Companies with no milestones
  const clientsWithMilestones = new Set(Object.keys(byCompany));
  const clientsWithout = companies.filter((c: any) => !clientsWithMilestones.has(c.id));

  const totalMilestones = milestones.length;
  const completed       = milestones.filter((m: any) => m.status === 'complete').length;
  const inProgress      = milestones.filter((m: any) => m.status === 'in_progress').length;

  return (
    <>
      <AdminTopbar
        title="Roadmap Management"
        subtitle={`All client roadmaps — ${currentYear()}`}
      />
      <main className="admin-page flex-1">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Milestones', val: totalMilestones, color: 'var(--ink)' },
            { label: 'Complete',         val: completed,        color: 'var(--teal)' },
            { label: 'In Progress',      val: inProgress,       color: 'var(--purple)' },
          ].map((s) => (
            <div key={s.label} className="card p-5">
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
              <p className="text-3xl font-bold font-display" style={{ color: s.color }}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Per-client roadmaps */}
        <div className="space-y-6">
          {Object.entries(byCompany).map(([cid, client]) => {
            // Group milestones by quarter, then by track
            const byQuarter: Record<string, any[]> = {};
            for (const m of client.milestones) {
              const q = m.quarter ?? 'Q1';
              if (!byQuarter[q]) byQuarter[q] = [];
              byQuarter[q].push(m);
            }

            return (
              <section key={cid} className="card overflow-hidden">
                {/* Client header */}
                <div
                  className="flex items-center justify-between px-6 py-4"
                  style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-alt)' }}
                >
                  <h2 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>
                    {client.name}
                  </h2>
                  <Link
                    href={`/clients/${cid}`}
                    className="text-xs font-medium"
                    style={{ color: 'var(--purple)' }}
                  >
                    View client →
                  </Link>
                </div>

                {/* Quarter columns */}
                <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'var(--line)' }}>
                  {QUARTERS.map((q) => {
                    const qMilestones = byQuarter[q] ?? [];
                    return (
                      <div key={q} className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>
                          {q} {currentYear()}
                        </p>
                        {qMilestones.length === 0 ? (
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No milestones</p>
                        ) : (
                          <div className="space-y-2">
                            {(['HIRE', 'LEAD', 'PROTECT'] as Track[]).map((track) => {
                              const trackItems = qMilestones.filter((m: any) => m.track === track);
                              if (trackItems.length === 0) return null;
                              const tc = TRACK_COLORS[track];
                              return (
                                <div key={track}>
                                  <span
                                    className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mb-1"
                                    style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}
                                  >
                                    {track}
                                  </span>
                                  <div className="space-y-1">
                                    {trackItems.map((m: any) => {
                                      const StatusIcon  = STATUS_ICON[m.status] ?? Circle;
                                      const statusColor = STATUS_COLOR[m.status] ?? 'var(--ink-faint)';
                                      return (
                                        <div key={m.id} className="flex items-start gap-1.5">
                                          <StatusIcon
                                            size={12}
                                            className="flex-shrink-0 mt-0.5"
                                            style={{ color: statusColor }}
                                          />
                                          <p className="text-xs leading-snug" style={{ color: 'var(--ink-soft)' }}>
                                            {m.title}
                                          </p>
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

          {/* Clients with no milestones */}
          {clientsWithout.length > 0 && (
            <section className="card p-6">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>
                Clients without a roadmap
              </p>
              <div className="flex flex-wrap gap-2">
                {clientsWithout.map((c: any) => (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:opacity-80"
                    style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}
                  >
                    <Map size={11} />
                    {c.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {milestones.length === 0 && clientsWithout.length === 0 && (
            <div className="card flex flex-col items-center gap-3 py-16">
              <Map size={32} style={{ color: 'var(--ink-faint)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
                No milestones yet. Add milestones from a client's Roadmap tab.
              </p>
            </div>
          )}
        </div>

      </main>
    </>
  );
}
