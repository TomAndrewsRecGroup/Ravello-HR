import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import FaqBlock from '@/components/FaqBlock';
import {
  ArrowRight, TrendingUp, Briefcase, BookOpen, Users, ShieldCheck,
  BarChart3, Target, Zap, CheckCircle2, FileText, Scale,
  PoundSterling, Calculator, GraduationCap, CalendarDays, Star, Play,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Insights | Portal, Role Scores and People Intelligence | The People System',
  description: 'Your client portal is a live view of your people function across HIRE, LEAD and PROTECT. Friction Lens role scores, salary and market benchmarks, compliance tracking, HR reports, and a company-wide People Score benchmarked against your industry.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/insights' },
};

const PILLARS = [
  {
    name: 'HIRE',
    tagline: 'Recruit with insight, not instinct.',
    icon: Briefcase,
    color: 'var(--brand-purple)',
    bg: 'rgba(124,58,237,0.08)',
    desc: 'Every live role scored for friction before it launches, with salary benchmarks, cost models and pipeline metrics running alongside.',
    features: [
      'Live requisitions and candidate pipeline',
      'Friction Lens score on every role before launch',
      'Salary benchmarks across the market range',
      'Vacancy cost calculator',
      'Cost modeller for offers and scenarios',
      'Hiring metrics, cycle times and feedback rates',
      'Internal-role tracking vs. The People System benchmarks',
    ],
  },
  {
    name: 'LEAD',
    tagline: 'Run the people function day to day.',
    icon: BookOpen,
    color: 'var(--brand-pink)',
    bg: 'rgba(234,61,196,0.08)',
    desc: 'The tools and frameworks to build manager capability from the inside out, so your managers lead well and your people see where the business is going.',
    features: [
      'Documents and policies, versioned by category',
      'Employee records with leave and demographics',
      'Performance review cycles and templates',
      'Training needs and the learning library',
      'Skills matrix and capability gaps',
      'Org chart with reporting lines',
      'Policy acknowledgements and sign-off tracking',
      'HR reports: headcount, leave, absence, demographics',
      'Onboarding workflows and checklists',
      'Roadmap and quarterly milestones',
    ],
  },
  {
    name: 'PROTECT',
    tagline: 'Stay compliant, stay protected.',
    icon: Users,
    color: 'var(--brand-blue)',
    bg: 'rgba(59,111,255,0.08)',
    desc: 'Everything that keeps your business legally sound and your records watertight. Tracked, flagged, and never left to chance.',
    features: [
      'Compliance tracker with RAG status and due dates',
      'Absence management with approval workflows',
      'Employee document expiry alerts (30-day window)',
      'HR dashboard: records, reviews, training at a glance',
      'Actions from The People System, prioritised',
      'Offboarding workflows and knowledge transfer',
      'Live CSV exports: roles, candidates, compliance, actions',
    ],
  },
];

const INSIGHT_TOOLS = [
  { icon: Target,        title: 'Friction Lens Role Scores', desc: 'Every role scored on five dimensions against live market data before it goes live.' },
  { icon: Scale,         title: 'Salary Benchmarks',         desc: 'Market compensation benchmarks across the full range by role type, location and seniority.' },
  { icon: PoundSterling, title: 'Vacancy Cost',              desc: 'Quantify the true cost of an open role: salary, productivity loss, fees, time.' },
  { icon: Calculator,    title: 'Hiring Cost Modeller',      desc: 'Model offers, counter-offers and recruitment scenarios before you commit.' },
  { icon: BarChart3,     title: 'Hiring Metrics',            desc: 'Time-to-fill, pipeline conversion, feedback rates, friction distribution.' },
  { icon: FileText,      title: 'HR Reports',                desc: 'Headcount, leave, absence and demographics: exportable for board reporting.' },
  { icon: ShieldCheck,   title: 'Compliance Tracker',        desc: 'Every compliance item tracked against due dates, with overdue items auto-flagged.' },
  { icon: TrendingUp,    title: 'Company People Score',      desc: 'Your entire people function benchmarked against your sector and size.' },
];

type CalCell =
  | { blank: true }
  | {
      day: number;
      today?: boolean;
      events?: { type: 'leave' | 'sick' | 'holiday' | 'event'; label?: string }[];
    };

const CALENDAR_MOCK: CalCell[] = [
  // Week 1 (Apr 2026 starts Wed, so Mon & Tue blank)
  { blank: true }, { blank: true },
  { day: 1 }, { day: 2 },
  { day: 3, events: [{ type: 'leave' }] },
  { day: 4 }, { day: 5 },
  // Week 2
  { day: 6, events: [{ type: 'holiday' }] },
  { day: 7 }, { day: 8 },
  { day: 9, events: [{ type: 'leave' }] },
  { day: 10, events: [{ type: 'sick' }] },
  { day: 11 }, { day: 12 },
  // Week 3
  { day: 13 },
  { day: 14, events: [{ type: 'leave' }] },
  { day: 15 },
  { day: 16, today: true, events: [{ type: 'event' }] },
  { day: 17, events: [{ type: 'leave' }] },
  { day: 18 }, { day: 19 },
  // Week 4
  { day: 20 }, { day: 21 },
  { day: 22, events: [{ type: 'sick' }] },
  { day: 23 }, { day: 24 },
  { day: 25, events: [{ type: 'event' }] },
  { day: 26 },
  // Week 5
  { day: 27 }, { day: 28 },
  { day: 29, events: [{ type: 'leave' }] },
  { day: 30 },
  { blank: true }, { blank: true }, { blank: true },
];

const EVENT_COLOURS: Record<'leave' | 'sick' | 'holiday' | 'event', { dot: string; bg: string }> = {
  leave:   { dot: '#10B981', bg: 'rgba(16,185,129,0.14)' },
  sick:    { dot: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
  holiday: { dot: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  event:   { dot: '#3B6FFF', bg: 'rgba(59,111,255,0.12)' },
};

function CalendarCell({ cell }: { cell: CalCell }) {
  if ('blank' in cell) {
    return <div className="aspect-square rounded-[6px]" style={{ background: 'transparent' }} />;
  }
  const ev = cell.events?.[0];
  const colour = ev ? EVENT_COLOURS[ev.type] : null;
  return (
    <div
      className="aspect-square rounded-[6px] flex flex-col items-center justify-center relative"
      style={{
        background: ev ? colour!.bg : 'var(--surface)',
        border: '1px solid var(--brand-line)',
      }}
    >
      {cell.today ? (
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: 'var(--brand-purple)' }}
        >
          {cell.day}
        </span>
      ) : (
        <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-soft)' }}>
          {cell.day}
        </span>
      )}
      {ev && (
        <span
          className="absolute bottom-1 w-1.5 h-1.5 rounded-full"
          style={{ background: colour!.dot }}
        />
      )}
    </div>
  );
}

const FRICTION_DIMENSIONS = [
  { name: 'Location', desc: 'Is your location requirement realistic for the talent pool?', color: '#7B2FBE' },
  { name: 'Salary', desc: 'Is your compensation competitive against live market data?', color: '#4B6EF5' },
  { name: 'Skills', desc: 'Are your must-haves genuinely necessary or narrowing your pool?', color: '#E04898' },
  { name: 'Working Model', desc: 'Does your office/hybrid/remote stance match candidate expectations?', color: '#2E8B7A' },
  { name: 'Process', desc: 'Is your interview process efficient enough to retain strong candidates?', color: '#B45309' },
];

export default function InsightsPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                Insights
              </p>
              <h1
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
                  fontWeight: 800,
                  lineHeight: 1.02,
                  letterSpacing: '-0.04em',
                  color: 'var(--ink)',
                }}
              >
                Your people function,{' '}
                <span className="text-gradient">live in your portal</span>
              </h1>
              <p className="text-lg leading-relaxed mb-6 max-w-[520px]" style={{ color: 'var(--ink-soft)' }}>
                Three working modules: HIRE, LEAD and PROTECT. Friction Lens role scores
                and market benchmarks sit alongside the documents, records, reviews,
                compliance and reports your team uses every day.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
                <Link href="/smart-hiring-system" className="btn-secondary">
                  Explore HIRE packages
                </Link>
              </div>
            </div>

            {/* Stock image */}
            <div className="hidden lg:block">
              <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(10,15,30,0.08)' }}>
                <Image
                  src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&h=600&fit=crop&crop=faces"
                  alt="Team reviewing analytics dashboard together"
                  width={800}
                  height={600}
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portal pillars */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[640px] mb-14">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Your portal
            </p>
            <h3
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
              }}
            >
              Built around{' '}
              <span className="text-gradient">HIRE, LEAD &amp; PROTECT</span>
            </h3>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Your portal mirrors the way we structure your people function. Three
              working modules, each with its own records, workflows and reporting,
              plus scoring and benchmarks cutting across all of them.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.name}
                  className="card flex flex-col"
                  style={{ padding: '1.75rem', borderTop: `3px solid ${p.color}` }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-11 h-11 rounded-[14px] flex items-center justify-center"
                      style={{ background: p.bg }}
                    >
                      <Icon size={20} style={{ color: p.color }} />
                    </div>
                    <div>
                      <p className="eyebrow" style={{ color: p.color, margin: 0 }}>{p.name}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{p.tagline}</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ink-soft)' }}>
                    {p.desc}
                  </p>
                  <ul className="space-y-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: p.color }} />
                        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Standalone tools strip */}
          <div
            className="mt-8 rounded-[16px] px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{ background: 'var(--bg)', border: '1px solid var(--brand-line)' }}
          >
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>
              Running across everything
            </span>
            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              <strong style={{ color: 'var(--ink)' }}>Dashboard</strong>: live snapshot of roles, actions, compliance and score
            </span>
            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              <strong style={{ color: 'var(--ink)' }}>Calendar</strong>: company events, closures and leave
            </span>
            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              <strong style={{ color: 'var(--ink)' }}>Support</strong>: raise HR queries direct to us
            </span>
          </div>
        </div>
      </section>

      {/* Friction Lens for Roles */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Score card mockup */}
            <div>
              <div
                className="rounded-[24px] p-8"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 32px rgba(10,15,30,0.06)',
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <span className="eyebrow">Friction Lens&trade; Role Score</span>
                  <span
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(22,163,74,0.10)', color: '#16A34A' }}
                  >
                    Low Friction
                  </span>
                </div>

                <div className="flex items-baseline gap-3 mb-6">
                  <span className="font-mono text-5xl font-bold" style={{ color: '#16A34A', letterSpacing: '-0.04em' }}>28</span>
                  <span className="text-base" style={{ color: 'var(--ink-faint)' }}>/100</span>
                  <span className="text-sm font-medium ml-auto" style={{ color: 'var(--ink-soft)' }}>Senior Marketing Manager</span>
                </div>

                <div className="space-y-4">
                  {[
                    { name: 'Location', val: 18, color: '#16A34A' },
                    { name: 'Salary', val: 32, color: '#16A34A' },
                    { name: 'Skills', val: 22, color: '#16A34A' },
                    { name: 'Working Model', val: 15, color: '#16A34A' },
                    { name: 'Process', val: 35, color: '#D97706' },
                  ].map((b) => (
                    <div key={b.name}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>{b.name}</span>
                        <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink)' }}>{b.val}</span>
                      </div>
                      <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                        <div className="h-full rounded-full" style={{ width: `${b.val}%`, background: b.color }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--brand-line)' }}>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--ink)' }}>Recommendations</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#16A34A' }} />
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Process: Consider reducing from 4 stages to 3 for this seniority level</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#16A34A' }} />
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Salary is well-positioned. No changes needed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                Friction Lens for roles
              </p>
              <h3
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                Score every role<br />
                <span className="text-gradient">before it goes to market</span>
              </h3>
              <p className="text-lg leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
                Before any role goes live, Friction Lens scores it across five dimensions
                against live market data. You see exactly where it will struggle and what to
                change before you spend a single day recruiting.
              </p>

              <div className="space-y-3 mb-8">
                {FRICTION_DIMENSIONS.map((d) => (
                  <div key={d.name} className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: d.color }} />
                    <div>
                      <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{d.name}: </span>
                      <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{d.desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-sm mb-6" style={{ color: 'var(--ink-faint)' }}>
                Built by Tom Andrews through IvyLens Technology. Included in every HIRE engagement as standard.
              </p>

              <Link href="/book" className="btn-gradient">Book a Call</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Insight & decision-support tools */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[640px] mb-12">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Insights and intelligence
            </p>
            <h3
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
              }}
            >
              The tools that turn your portal{' '}
              <span className="text-gradient">into decisions</span>
            </h3>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Scoring, benchmarks, costing and reporting: the analytical layer that
              sits over every record in your portal and tells you what to do next.
              Friction Lens leads the way, with a stack of commercial tools
              alongside it.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {INSIGHT_TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.title} className="card flex flex-col" style={{ padding: '1.5rem' }}>
                  <div
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-4"
                    style={{ background: 'rgba(124,58,237,0.08)' }}
                  >
                    <Icon size={18} style={{ color: 'var(--brand-purple)' }} />
                  </div>
                  <h4 className="font-bold text-[0.95rem] mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                    {t.title}
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{t.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Company-wide People Score */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Copy first on this one */}
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                Company People Score
              </p>
              <h3
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                See how your people function<br />
                <span className="text-gradient">compares to your industry</span>
              </h3>
              <p className="text-lg leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
                Your People Score benchmarks your entire HR function against businesses of a
                similar size and sector. See where you stand today, track your improvement
                over time, and watch your score increase as we work with you.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  'Hiring efficiency, time-to-fill, and retention rates',
                  'Compliance coverage and document currency',
                  'People development maturity (training, reviews, skills)',
                  'Employee relations health (absences, turnover, engagement)',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-purple)' }} />
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                  </div>
                ))}
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-faint)' }}>
                Most clients start between 30 and 50. Within 6 months of working with us,
                the average score reaches 75+. You can track every point of improvement
                directly in your portal.
              </p>

              <Link href="/book" className="btn-gradient">Book a Call</Link>
            </div>

            {/* Company score mockup */}
            <div>
              <div
                className="rounded-[24px] p-8"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 32px rgba(10,15,30,0.06)',
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <span className="eyebrow">Company People Score</span>
                  <span
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--brand-purple)' }}
                  >
                    Manufacturing, 85 employees
                  </span>
                </div>

                {/* Big score */}
                <div className="text-center mb-8">
                  <div className="relative inline-flex items-center justify-center w-40 h-40">
                    <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-alt)" strokeWidth="8" />
                      <circle
                        cx="60" cy="60" r="52" fill="none"
                        stroke="url(#scoreGrad)" strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(72 / 100) * 327} 327`}
                      />
                      <defs>
                        <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#EA3DC4" />
                          <stop offset="50%" stopColor="#7C3AED" />
                          <stop offset="100%" stopColor="#3B6FFF" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-4xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>72</span>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>/100</span>
                    </div>
                  </div>
                </div>

                {/* Industry comparison */}
                <div className="space-y-4 mb-6">
                  {[
                    { label: 'Your Score', val: 72, color: 'var(--brand-purple)' },
                    { label: 'Industry Average', val: 48, color: 'var(--ink-faint)' },
                  ].map((bar) => (
                    <div key={bar.label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>{bar.label}</span>
                        <span className="font-mono text-sm font-bold" style={{ color: bar.color }}>{bar.val}</span>
                      </div>
                      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                        <div className="h-full rounded-full" style={{ width: `${bar.val}%`, background: bar.color }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Trend */}
                <div className="flex items-center gap-2 pt-4" style={{ borderTop: '1px solid var(--brand-line)' }}>
                  <TrendingUp size={16} style={{ color: '#16A34A' }} />
                  <span className="text-sm font-bold" style={{ color: '#16A34A' }}>+24 points</span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>since starting with The People System (6 months)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Learning & Calendar */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[640px] mb-16">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-pink)', verticalAlign: 'middle' }} />
              Beyond the scores
            </p>
            <h3
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
              }}
            >
              Finally, a tool your team{' '}
              <span className="text-gradient">will actually use.</span>
            </h3>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              This isn&rsquo;t a system you log into once a quarter. It&rsquo;s where your
              managers stay on top of their team, your people find what they need, and
              nothing gets missed.
            </p>
          </div>

          {/* Row 1: Learning */}
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">

            {/* Learning mockup */}
            <div>
              <div
                className="rounded-[24px] p-6"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 32px rgba(10,15,30,0.06)',
                }}
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="eyebrow" style={{ margin: 0 }}>
                    <GraduationCap size={12} className="inline mr-1.5" style={{ verticalAlign: 'middle', color: 'var(--brand-purple)' }} />
                    Learning Library
                  </span>
                  <span
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--brand-purple)' }}
                  >
                    12 items
                  </span>
                </div>

                {/* Featured hero tile */}
                <div
                  className="rounded-[16px] overflow-hidden mb-4 relative"
                  style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4B6EF5 60%, #EA3DC4 100%)', height: 140 }}
                >
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                      style={{ background: 'rgba(253,243,214,0.95)', color: '#7E5A10' }}
                    >
                      <Star size={9} fill="#BF8F28" style={{ color: '#BF8F28' }} /> Featured
                    </span>
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.95)' }}
                    >
                      Video
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.95)' }}
                    >
                      <Play size={12} fill="#7C3AED" style={{ color: '#7C3AED' }} />
                    </span>
                  </div>
                  <div className="absolute inset-x-4 bottom-3">
                    <p className="font-bold text-white text-sm mb-0.5 leading-tight">
                      Difficult Conversations for Managers
                    </p>
                    <p className="text-white/75 text-[11px]">Lucy Andrews</p>
                  </div>
                </div>

                {/* Smaller cards */}
                <div className="space-y-2">
                  {[
                    { title: 'Onboarding Playbook', meta: 'PDF · 24 pages', badge: 'Shared', badgeBg: 'rgba(34,197,94,0.10)', badgeColor: '#16A34A', thumbBg: 'linear-gradient(135deg, #3B6FFF, #7C3AED)' },
                    { title: 'Performance Review Framework', meta: 'Video', badge: 'Active', badgeBg: 'rgba(124,58,237,0.10)', badgeColor: 'var(--brand-purple)', thumbBg: 'linear-gradient(135deg, #EA3DC4, #7C3AED)' },
                    { title: 'AI at Work Policy', meta: 'PDF · 8 pages', badge: 'New', badgeBg: 'rgba(245,158,11,0.12)', badgeColor: '#92400E', thumbBg: 'linear-gradient(135deg, #BF8F28, #7C3AED)' },
                  ].map((c) => (
                    <div
                      key={c.title}
                      className="flex items-center gap-3 p-2 rounded-[10px]"
                      style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}
                    >
                      <div className="w-10 h-10 rounded-[8px] flex-shrink-0" style={{ background: c.thumbBg }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.title}</p>
                        <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{c.meta}</p>
                      </div>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: c.badgeBg, color: c.badgeColor }}
                      >
                        {c.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Learning copy */}
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                Learning content
              </p>
              <h3
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.6rem, 2.6vw, 2.4rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                Build a library{' '}
                <span className="text-gradient">your team actually uses</span>
              </h3>
              <p className="text-lg leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
                Upload videos, PDFs, playbooks and policies and share them with
                your whole team or a specific group. We keep the library stocked
                with practical guides on the things managers usually struggle
                with: performance reviews, difficult conversations, onboarding,
                AI at work. You add your own on top.
              </p>

              <div className="space-y-3 mb-6">
                {[
                  'Upload your own content: videos, PDFs, interactive modules',
                  'A curated starter library maintained by The People System',
                  'Share with everyone or with a specific team',
                  'Track who has opened, started and completed each item',
                  'Bundle content into your engagement or sell it per seat',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-purple)' }} />
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                  </div>
                ))}
              </div>

              <Link href="/book" className="btn-secondary">Book a Call</Link>
            </div>
          </div>

          {/* Row 2: Calendar */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Calendar copy */}
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-blue)', verticalAlign: 'middle' }} />
                Company calendar
              </p>
              <h3
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.6rem, 2.6vw, 2.4rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                One view of who is in,{' '}
                <span className="text-gradient">who is out, and what is coming</span>
              </h3>
              <p className="text-lg leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
                Annual leave, sick days, bank holidays, company-wide events and
                office closures all on one shared calendar. Managers plan around
                it, the team can see what is coming, and everything is
                colour-coded by type so the view stays readable.
              </p>

              <div className="space-y-3 mb-6">
                {[
                  'Log annual leave, sick days, maternity, paternity and more',
                  'Bank holidays pre-loaded for your jurisdiction',
                  'Company events, all-hands and office closures',
                  'Team-wide visibility with clear colour coding',
                  'Approval workflow for leave requests',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                  </div>
                ))}
              </div>

              <Link href="/book" className="btn-secondary">Book a Call</Link>
            </div>

            {/* Calendar mockup */}
            <div>
              <div
                className="rounded-[24px] p-6"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 32px rgba(10,15,30,0.06)',
                }}
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="eyebrow" style={{ margin: 0 }}>
                    <CalendarDays size={12} className="inline mr-1.5" style={{ verticalAlign: 'middle', color: 'var(--brand-blue)' }} />
                    Company Calendar
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-soft)' }}>April 2026</span>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={i} className="text-center text-[10px] font-bold py-1" style={{ color: 'var(--ink-faint)' }}>{d}</div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1">
                  {CALENDAR_MOCK.map((cell, i) => (
                    <CalendarCell key={i} cell={cell} />
                  ))}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--brand-line)' }}>
                  {[
                    { color: '#10B981', label: 'Annual Leave' },
                    { color: '#F59E0B', label: 'Sick Day' },
                    { color: '#7C3AED', label: 'Bank Holiday' },
                    { color: '#3B6FFF', label: 'Company Event' },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                      <span className="text-[11px] font-medium" style={{ color: 'var(--ink-soft)' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How the scores work together */}
      <section className="section-sm" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div
            className="rounded-[24px] p-10"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.04), rgba(59,111,255,0.04))',
              border: '1px solid rgba(124,58,237,0.12)',
            }}
          >
            <div className="grid lg:grid-cols-3 gap-8 text-center">
              <div>
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(124,58,237,0.10)' }}>
                  <Target size={22} style={{ color: 'var(--brand-purple)' }} />
                </div>
                <h4 className="font-bold text-base mb-2" style={{ color: 'var(--ink)' }}>Role-Level Scoring</h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  Every individual role gets a Friction Lens score before it goes live. Fix problems before you recruit.
                </p>
              </div>
              <div>
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(59,111,255,0.10)' }}>
                  <BarChart3 size={22} style={{ color: 'var(--brand-blue)' }} />
                </div>
                <h4 className="font-bold text-base mb-2" style={{ color: 'var(--ink)' }}>Company-Wide Benchmark</h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  Your People Score benchmarks your entire function against your industry. See exactly where you stand.
                </p>
              </div>
              <div>
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(234,61,196,0.10)' }}>
                  <Zap size={22} style={{ color: 'var(--brand-pink)' }} />
                </div>
                <h4 className="font-bold text-base mb-2" style={{ color: 'var(--ink)' }}>Tracked Across the Portal</h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  Both scores move as your portal fills up with real data: roles, hires, compliance, reviews. Every improvement is visible, measurable, and yours to keep.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-narrow text-center">
          <h3
            className="font-display mb-5"
            style={{
              fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              color: 'var(--ink)',
            }}
          >
            Ready to see your<br />
            <span className="text-gradient">People Score?</span>
          </h3>
          <p className="text-lg leading-relaxed mb-10 max-w-[500px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Book a free call. We will walk you through the portal, score one of your live roles,
            and show you where your people function sits against your industry.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/book" className="btn-gradient">Book a Call</Link>
            <Link href="/smart-hiring-system" className="btn-secondary">
              Explore HIRE packages
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
        { q: 'What is Friction Lens?', a: 'Friction Lens is a role-level scoring tool built by Tom Andrews through IvyLens Technology. It scores every active role across five dimensions (Location, Salary, Skills, Working Model, and Process) before it goes to market. It is included in every HIRE engagement and lives in your portal under HIRE.' },
        { q: 'What is the Company People Score?', a: 'A benchmark of your entire people function, scored against businesses of similar size and sector. It measures hiring efficiency, compliance health, people development maturity, and employee relations. You can track your score over time on your dashboard.' },
        { q: 'How is the People Score calculated?', a: 'We assess your current state across four pillars: hiring, compliance, people development, and employee relations. Each pillar is weighted and scored based on real data from your portal, then compared against industry benchmarks.' },
        { q: 'What actually lives in the portal?', a: 'Three working modules. HIRE holds your requisitions, candidate pipeline, friction scores, benchmarks, vacancy cost and hiring metrics. LEAD holds your documents, employee records, reviews, training, skills, org chart, policy acknowledgements and HR reports. PROTECT holds compliance, absence, employee-doc expiry, actions, offboarding and exports. On top of that: a live dashboard, a shared calendar, and a direct support channel to us.' },
        { q: 'Do I need every module, or can I start with one?', a: 'You can start with one. Each module is feature-flagged and scoped to your engagement. Most clients begin with HIRE or PROTECT, then layer on LEAD as the people function matures.' },
        { q: 'What commercial tools sit inside the portal?', a: 'Salary benchmarks across the market range, a vacancy cost calculator, a hiring cost modeller, full hiring metrics, and exportable HR reports covering headcount, leave, absence and demographics. All live, all tied to the records in your portal.' },
        { q: 'Can I get my People Score without a full engagement?', a: 'Book a free call and we will give you an indicative score based on a short assessment. The full tracked score sits in the portal as part of any engagement.' },
        { q: 'How quickly does the score improve?', a: 'Most clients see a 15 to 25 point improvement within the first 3 months. Compliance and documentation improvements show the fastest gains. Hiring efficiency improvements typically follow in months 3 to 6.' },
      ]} />

    </div>
  );
}
