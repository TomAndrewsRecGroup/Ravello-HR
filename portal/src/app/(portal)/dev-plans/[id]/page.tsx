import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ArrowLeft, Check, Clock, Circle, ChevronDown, Sparkles, GraduationCap, Briefcase } from 'lucide-react';
import PrintButton from './PrintButton';

export const metadata: Metadata = { title: 'Development Plan' };
export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'badge' },
  in_progress: { label: 'In progress', cls: 'badge badge-inprogress' },
  done:        { label: 'Done',        cls: 'badge badge-resolved' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle size={12} />,
  in_progress: <Clock size={12} />,
  done: <Check size={12} />,
};

export default async function DevPlanDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: plan } = await supabase
    .from('dev_plans')
    .select('id, title, summary, status, assigned_at, brand_profile_id, training_items, roles_items, athlete:athlete_id (full_name)')
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

  const primary = brand?.primary_color || '#7C3AED';
  const secondary = brand?.secondary_color || '#3B6FFF';
  const accent = brand?.accent_color || primary;
  const fontFamily = brand?.font_family ? `"${brand.font_family}", var(--font-display)` : undefined;

  return (
    <main
      className="print-area print-keep-color"
      style={{
        background: `linear-gradient(180deg, ${hex(primary, 0.05)} 0%, ${hex(secondary, 0.04)} 100%)`,
        minHeight: '100vh',
        padding: '1.25rem',
      }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link href="/dev-plans" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: primary }}>
            <ArrowLeft size={14} /> Back to plans
          </Link>
          <PrintButton />
        </div>

        {/* Hero */}
        <div
          className="rounded-2xl p-7 mb-6 print-keep-color shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
            color: '#fff',
          }}
        >
          <div className="flex items-start gap-4">
            {brand?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt="logo" className="h-14 w-auto bg-white/95 rounded-lg p-2 print-keep-color" />
            )}
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80 mb-1">Development Plan</p>
              <h1 className="font-display text-3xl font-bold leading-tight" style={{ fontFamily }}>
                {plan.title}
              </h1>
              {athleteName && <p className="text-sm opacity-90 mt-2 font-semibold">For {athleteName}</p>}
              {plan.summary && <p className="text-sm opacity-90 mt-3 leading-relaxed max-w-2xl">{plan.summary}</p>}
            </div>
          </div>

          {total > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs font-semibold mb-2">
                <span className="opacity-90">Progress</span>
                <span>{done} of {total} · {pct}%</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden bg-white/20 print-keep-color">
                <div className="h-full bg-white print-keep-color" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Milestones — branded numbered timeline */}
        {ms.length > 0 && (
          <SectionHeader icon={<Sparkles size={16} />} label="Roadmap" colour={primary} fontFamily={fontFamily} />
        )}
        {ms.length === 0 ? null : (
          <ol className="space-y-0 mb-8">
            {ms.map((m, idx) => {
              const badge = STATUS_BADGE[m.status] ?? STATUS_BADGE.pending;
              const isLast = idx === ms.length - 1;
              const isDone = m.status === 'done';
              return (
                <li key={m.id} className="relative">
                  <div className="flex gap-4">
                    {/* Number badge + rail */}
                    <div className="relative flex-shrink-0 flex flex-col items-center">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-base print-keep-color shadow-md"
                        style={{
                          background: isDone ? secondary : primary,
                          color: '#fff',
                          fontFamily,
                        }}
                      >
                        {idx + 1}
                      </div>
                      {!isLast && (
                        <div
                          className="flex-1 w-1 print-keep-color"
                          style={{
                            background: `linear-gradient(180deg, ${primary} 0%, ${hex(primary, 0.25)} 100%)`,
                            minHeight: 60,
                            marginTop: 4,
                            marginBottom: 4,
                            borderRadius: 2,
                          }}
                        />
                      )}
                    </div>

                    {/* Card */}
                    <div
                      className="flex-1 rounded-xl p-4 mb-4 print-keep-color"
                      style={{
                        background: '#fff',
                        border: `1px solid ${hex(primary, 0.18)}`,
                        borderLeft: `4px solid ${primary}`,
                        boxShadow: `0 2px 12px ${hex(primary, 0.08)}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base" style={{ color: 'var(--ink)', fontFamily }}>
                          {m.title}
                        </h3>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full inline-flex items-center gap-1 print-keep-color whitespace-nowrap"
                          style={{
                            background: isDone ? hex(secondary, 0.12) : hex(primary, 0.08),
                            color: isDone ? secondary : primary,
                          }}
                        >
                          {STATUS_ICON[m.status]} {badge.label}
                        </span>
                      </div>
                      {m.description && (
                        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                          {m.description}
                        </p>
                      )}
                      {m.due_date && (
                        <p className="text-xs mt-3 inline-flex items-center gap-1" style={{ color: primary }}>
                          <Clock size={11} /> Due {new Date(m.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Down arrow connector */}
                  {!isLast && (
                    <div
                      className="absolute left-5 -translate-x-1/2 print-keep-color flex items-center justify-center rounded-full"
                      style={{
                        bottom: 6,
                        width: 22,
                        height: 22,
                        background: '#fff',
                        border: `2px solid ${primary}`,
                        color: primary,
                      }}
                      aria-hidden="true"
                    >
                      <ChevronDown size={12} strokeWidth={3} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <FreeTextSection
          title="Training & Workshops"
          icon={<GraduationCap size={16} />}
          items={(plan as { training_items?: Array<{ box1: string; box2: string }> }).training_items}
          primary={primary}
          accent={accent}
          fontFamily={fontFamily}
        />
        <FreeTextSection
          title="Roles & Ideas"
          icon={<Briefcase size={16} />}
          items={(plan as { roles_items?: Array<{ box1: string; box2: string }> }).roles_items}
          primary={secondary}
          accent={accent}
          fontFamily={fontFamily}
        />

        <footer className="mt-10 mb-4 text-center text-[11px] no-print" style={{ color: 'var(--ink-faint)' }}>
          Development plan • The People System
        </footer>
      </div>
    </main>
  );
}

function SectionHeader({ icon, label, colour, fontFamily }: { icon: React.ReactNode; label: string; colour: string; fontFamily?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-2">
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center print-keep-color"
        style={{ background: hex(colour, 0.12), color: colour }}
      >
        {icon}
      </span>
      <h2 className="font-display text-xl font-bold" style={{ color: colour, fontFamily }}>{label}</h2>
      <span className="flex-1 h-px print-keep-color" style={{ background: `linear-gradient(90deg, ${hex(colour, 0.25)}, transparent)` }} />
    </div>
  );
}

function FreeTextSection({
  title, icon, items, primary, accent, fontFamily,
}: {
  title: string;
  icon: React.ReactNode;
  items?: Array<{ box1: string; box2: string }> | null;
  primary: string;
  accent: string;
  fontFamily?: string;
}) {
  const list = (items ?? []).filter(it => it.box1 || it.box2);
  if (list.length === 0) return null;
  return (
    <section className="mb-8">
      <SectionHeader icon={icon} label={title} colour={primary} fontFamily={fontFamily} />
      <div className="grid sm:grid-cols-2 gap-3">
        {list.map((it, i) => (
          <div
            key={i}
            className="rounded-xl p-4 print-keep-color"
            style={{
              background: '#fff',
              border: `1px solid ${hex(primary, 0.18)}`,
              borderLeft: `4px solid ${primary}`,
              boxShadow: `0 2px 8px ${hex(primary, 0.06)}`,
            }}
          >
            {it.box1 && (
              <h3 className="font-semibold mb-1" style={{ color: primary, fontFamily }}>
                {it.box1}
              </h3>
            )}
            {it.box2 && (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>
                {it.box2}
              </p>
            )}
            {accent && it.box1 && (
              <span className="block w-8 h-0.5 mt-3 rounded-full print-keep-color" style={{ background: accent }} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// Tint helper — accepts #rrggbb / #rgb and returns rgba(r,g,b,alpha).
function hex(input: string, alpha = 1): string {
  if (!input) return `rgba(124,58,237,${alpha})`;
  if (input.startsWith('var(')) return input;
  let v = input.replace('#', '').toLowerCase();
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  if (v.length !== 6) return input;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
