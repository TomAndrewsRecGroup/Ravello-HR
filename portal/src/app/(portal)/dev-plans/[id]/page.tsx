import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ArrowLeft, Check, Clock, Circle } from 'lucide-react';
import PrintButton from './PrintButton';

export const metadata: Metadata = { title: 'Development Plan' };
export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'badge' },
  in_progress: { label: 'In progress', cls: 'badge badge-inprogress' },
  done:        { label: 'Done',        cls: 'badge badge-resolved' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle size={14} />,
  in_progress: <Clock size={14} />,
  done: <Check size={14} />,
};

export default async function DevPlanDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: plan } = await supabase
    .from('dev_plans')
    .select('id, title, summary, status, assigned_at, brand_profile_id, athlete:athlete_id (full_name)')
    .eq('id', params.id)
    .single();
  if (!plan) notFound();

  const [{ data: milestones }, { data: brand }] = await Promise.all([
    supabase.from('dev_plan_milestones')
      .select('id, title, description, due_date, status, sort_order')
      .eq('plan_id', params.id)
      .order('sort_order'),
    plan.brand_profile_id
      ? supabase.from('brand_profiles').select('*').eq('id', plan.brand_profile_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const ms = milestones ?? [];
  const done = ms.filter(m => m.status === 'done').length;
  const total = ms.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  type AthleteRel = { full_name: string } | { full_name: string }[] | null;
  const athleteRel = plan.athlete as AthleteRel;
  const athleteName = Array.isArray(athleteRel) ? athleteRel[0]?.full_name : athleteRel?.full_name;

  const primary = brand?.primary_color || 'var(--purple)';
  const secondary = brand?.secondary_color || 'var(--blue)';

  return (
    <main className="portal-page print-area">
      <div className="flex items-center justify-between mb-4 no-print">
        <Link href="/dev-plans" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: 'var(--purple)' }}>
          <ArrowLeft size={14} /> Back to plans
        </Link>
        <PrintButton />
      </div>

      <div
        className="card p-6 mb-6 print-keep-color"
        style={{
          background: brand
            ? `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
            : 'var(--gradient)',
          color: '#fff',
          border: 'none',
        }}
      >
        <div className="flex items-start gap-4">
          {brand?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="logo" className="h-12 w-auto bg-white/90 rounded-md p-1.5" />
          )}
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold" style={{ fontFamily: brand?.font_family ? `"${brand.font_family}", var(--font-display)` : undefined }}>
              {plan.title}
            </h1>
            {athleteName && <p className="text-sm opacity-90 mt-1">For {athleteName}</p>}
            {plan.summary && <p className="text-sm opacity-90 mt-3">{plan.summary}</p>}
          </div>
        </div>

        {total > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span>Progress</span><span>{done} of {total} ({pct}%)</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-white/20">
              <div className="h-full bg-white" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Milestones</h2>
        {ms.length === 0 ? (
          <div className="empty-state">No milestones in this plan.</div>
        ) : ms.map(m => {
          const badge = STATUS_BADGE[m.status] ?? STATUS_BADGE.pending;
          return (
            <div key={m.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5" style={{ color: m.status === 'done' ? 'var(--teal)' : 'var(--ink-faint)' }}>
                  {STATUS_ICON[m.status]}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{m.title}</h3>
                    <span className={badge.cls}>{badge.label}</span>
                  </div>
                  {m.description && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{m.description}</p>}
                  {m.due_date && (
                    <p className="text-xs mt-2" style={{ color: 'var(--ink-faint)' }}>
                      Due {new Date(m.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
