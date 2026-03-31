import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ComplianceStatusButton from '@/components/modules/ComplianceStatusButton';
import { ShieldCheck, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Compliance' };

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:   { background: 'rgba(148,163,184,0.12)', color: '#475569' },
  in_review: { background: 'rgba(245,158,11,0.12)',  color: '#92400E' },
  complete:  { background: 'rgba(22,163,74,0.12)',   color: '#166534' },
  overdue:   { background: 'rgba(220,38,38,0.12)',   color: '#991B1B' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock size={13} style={{ color: '#94A3B8' }} />,
  in_review: <AlertTriangle size={13} style={{ color: '#D97706' }} />,
  complete:  <CheckCircle2 size={13} style={{ color: '#16A34A' }} />,
  overdue:   <AlertTriangle size={13} style={{ color: '#DC2626' }} />,
};

function fmtCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isOverdue(item: any): boolean {
  return item.status !== 'complete' && new Date(item.due_date) < new Date();
}

function daysUntil(due: string): number {
  return Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
}

export default async function CompliancePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user?.id ?? '')
    .single();

  const companyId: string = (profile as any)?.company_id ?? '';

  const { data: items } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('company_id', companyId)
    .order('due_date', { ascending: true });

  const all = (items ?? []).map((ci: any) => ({
    ...ci,
    _overdue: isOverdue(ci),
  }));

  // Resolve effective status (auto-flag overdue)
  const resolved = all.map((ci: any) => ({
    ...ci,
    _effectiveStatus: ci._overdue ? 'overdue' : ci.status,
  }));

  const pending   = resolved.filter(ci => ci._effectiveStatus === 'pending');
  const inReview  = resolved.filter(ci => ci._effectiveStatus === 'in_review');
  const overdue   = resolved.filter(ci => ci._effectiveStatus === 'overdue');
  const complete  = resolved.filter(ci => ci._effectiveStatus === 'complete');

  const outstanding = pending.length + inReview.length + overdue.length;

  // Group by category for the full list
  const categories = [...new Set(resolved.map(ci => ci.category))].sort();

  return (
      <main className="portal-page flex-1">

        {all.length === 0 ? (
          <div className="card p-12">
            <div className="empty-state">
              <ShieldCheck size={28} style={{ color: 'var(--teal)' }} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>
                No compliance items
              </p>
              <p className="text-sm max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                The People Office will add compliance obligations here as they arise.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary stat row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Overdue',   value: overdue.length,  color: '#DC2626',  bg: 'rgba(220,38,38,0.06)' },
                { label: 'Pending',   value: pending.length,  color: '#D97706',  bg: 'rgba(245,158,11,0.06)' },
                { label: 'In Review', value: inReview.length, color: 'var(--blue)', bg: 'rgba(59,130,246,0.06)' },
                { label: 'Complete',  value: complete.length, color: '#16A34A',  bg: 'rgba(22,163,74,0.06)' },
              ].map(s => (
                <div key={s.label} className="card p-4" style={{ background: s.bg, borderColor: `color-mix(in srgb, ${s.color} 20%, transparent)` }}>
                  <p className="text-xs font-medium mb-1" style={{ color: s.color }}>{s.label}</p>
                  <p className="font-display font-bold text-3xl" style={{ color: 'var(--ink)' }}>{s.value}</p>
                </div>
              ))}
            </div>

            {outstanding > 0 && (
              <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
                {outstanding} outstanding item{outstanding !== 1 ? 's' : ''} requiring attention
              </p>
            )}

            {/* Items by category */}
            <div className="space-y-8">
              {categories.map(cat => {
                const catItems = resolved.filter(ci => ci.category === cat);
                const catLabel = fmtCategory(cat);
                return (
                  <section key={cat}>
                    <h2
                      className="font-display font-semibold text-sm mb-3 flex items-center gap-2"
                      style={{ color: 'var(--ink)' }}
                    >
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--purple)' }} />
                      {catLabel}
                      <span className="font-normal text-xs" style={{ color: 'var(--ink-faint)' }}>
                        ({catItems.length})
                      </span>
                    </h2>
                    <div className="space-y-3">
                      {catItems.map((ci: any) => {
                        const days = daysUntil(ci.due_date);
                        const eff  = ci._effectiveStatus;
                        return (
                          <div
                            key={ci.id}
                            className="card p-5"
                            style={eff === 'overdue' ? { borderColor: 'rgba(220,38,38,0.25)', background: 'rgba(220,38,38,0.02)' } : undefined}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className="mt-0.5 flex-shrink-0">
                                  {STATUS_ICON[eff] ?? STATUS_ICON.pending}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{ci.title}</p>
                                  {ci.description && (
                                    <p className="text-sm mt-0.5 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                                      {ci.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                                    <span
                                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                      style={STATUS_STYLE[eff] ?? STATUS_STYLE.pending}
                                    >
                                      {eff.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-xs" style={{ color: eff === 'overdue' ? '#991B1B' : 'var(--ink-faint)', fontWeight: eff === 'overdue' ? 600 : undefined }}>
                                      {eff === 'overdue'
                                        ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`
                                        : eff === 'complete'
                                          ? `Due ${fmtDate(ci.due_date)}`
                                          : days <= 7
                                            ? `Due in ${days} day${days !== 1 ? 's' : ''}`
                                            : `Due ${fmtDate(ci.due_date)}`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {eff !== 'complete' && (
                                <ComplianceStatusButton itemId={ci.id} currentStatus={ci.status} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
  );
}
