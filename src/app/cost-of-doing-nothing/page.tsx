import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, AlertTriangle, Scale, UserX, Clock, TrendingUp,
  ShieldCheck, FileSignature, UsersRound, Calendar, BarChart3,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cost of doing nothing | The People System',
  description:
    'The 2026 employment rules SME founders are not ready for. Day-1 unfair dismissal rights, tribunal awards, bad-hire costs, and what it adds up to in 12 months. With sources.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/cost-of-doing-nothing' },
};

// ─── Stats: every figure here has a source. Do not edit without ─────
//      checking the citation still says what we say it says.
const PAINS = [
  {
    icon: AlertTriangle,
    stat: 'Day 1',
    headline: 'Day-1 unfair dismissal rights are coming',
    detail:
      "The Employment Rights Act 2024 removes the 2-year qualifying period for unfair dismissal. Day-1 protection commences in 2026. Without a properly drafted statutory probationary period in your contracts, every new hire can claim from their first shift.",
    source: 'Employment Rights Act 2024, UK Government / DBT',
  },
  {
    icon: Scale,
    stat: '£13,749',
    headline: 'Mean unfair dismissal award. And that is just the cheaper claim.',
    detail:
      "Mean award for unfair dismissal at tribunal: £13,749. Mean for race discrimination: £45,094. Mean for disability discrimination: £45,876. None of those numbers include your legal fees, the 12-18 months of management distraction, or the reputational damage.",
    source: 'Tribunal Statistics Quarterly, Ministry of Justice, 2023/24',
  },
  {
    icon: UserX,
    stat: '£132,000',
    headline: 'What a bad mid-level hire actually costs you',
    detail:
      "REC research puts the true cost of a bad hire at a £42k salary at over £132,000 once you count recruitment, onboarding, lost productivity, management time, and the cost of replacing them. The cheapest bad hire you make this year still costs you a year's profit on the role.",
    source: 'REC, Perfect Match research',
  },
  {
    icon: Clock,
    stat: '49 days',
    headline: 'Average UK time-to-hire. Senior roles take twice that.',
    detail:
      "Median time-to-hire across UK roles is 49 days. Specialist and senior roles routinely run 90-120 days. Every week without the right person costs output, momentum, and team morale. The 14-week senior search is the silent killer of growth-stage Q-by-Q targets.",
    source: 'LinkedIn Talent Insights / Reed UK Salary Guide 2025',
  },
  {
    icon: TrendingUp,
    stat: '+17%',
    headline: 'Two years of National Living Wage rises baked into payroll',
    detail:
      "The National Living Wage went up 9.8% in April 2024 (£11.44/hr) and 6.7% in April 2025 (£12.21/hr). Over 17% compounded. For a 25-person workforce on or near the wage floor, that is roughly £60,000 of additional payroll cost a year, with no productivity gain attached.",
    source: 'Low Pay Commission / HMRC',
  },
];

const FIXES = [
  {
    icon: FileSignature,
    label: 'Day-1 ready contracts',
    detail:
      "We rewrite your employment contracts with a proper statutory probationary period and a written, evidenced review process. Probation dismissals stand up if challenged.",
  },
  {
    icon: ShieldCheck,
    label: 'Quarterly compliance audit',
    detail:
      "We run the audit ACAS would run. Gaps are flagged and closed before they become claims. CIPD-qualified, TUPE specialist, zero tribunal outcomes on our watch.",
  },
  {
    icon: UsersRound,
    label: 'Wrong hires never make contract',
    detail:
      "We sit second-chair on every offer. Friction Lens screens the role definition. Structured interviews, reference depth, and a kill-switch decision review before sign-off.",
  },
  {
    icon: Calendar,
    label: 'Time-to-hire cut in half',
    detail:
      "Pipelines warm before you need them. Shortlists held back, not built from scratch. Our average senior fill is under 6 weeks, not 14.",
  },
  {
    icon: BarChart3,
    label: 'Workforce planning that pays you back',
    detail:
      "Annual cost-modelling maps NLW, SSP, and pension changes 18 months out. No more April surprises. Headcount plans tied to actual revenue triggers.",
  },
];

export default function CostOfDoingNothingPage() {
  return (
    <main>
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_460px] gap-16 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                  style={{ background: '#D94444', verticalAlign: 'middle' }}
                />
                The cost of doing nothing
              </p>

              <h1
                className="font-display mb-6"
                style={{
                  fontSize: 'clamp(2.2rem, 4vw, 3.6rem)',
                  fontWeight: 800,
                  lineHeight: 1.04,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                Every month you delay<br />
                <span className="text-gradient">costs more than the fix.</span>
              </h1>

              <p className="text-lg leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
                These are not hypothetical numbers, scare tactics, or marketing rounds.
                They are the published cost of leaving your people function to chance in
                2026. Every one is sourced. Every one applies to a UK SME like yours.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
                <Link href="/tools/hr-risk-score" className="btn-secondary">
                  Find your gaps in 2 minutes <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(10,15,30,0.08)' }}>
                <Image
                  src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=920&h=1100&fit=crop"
                  alt="Founder reviewing financial figures"
                  width={460}
                  height={560}
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5 stats grid (option B from the brief) ───────────────── */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="max-w-[680px] mb-14">
            <h2
              className="font-display mb-4"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                color: 'var(--ink)',
              }}
            >
              Five 2026 numbers most founders don&apos;t know.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              The businesses that grow fastest fix this first. The ones that don&apos;t
              find out when something breaks.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {PAINS.map(({ icon: Icon, stat, headline, detail, source }) => (
              <div
                key={headline}
                className="p-7 rounded-[16px]"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 1px 2px rgba(10,15,30,0.03)',
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center"
                    style={{ background: 'rgba(217,68,68,0.08)', color: '#D94444' }}
                  >
                    <Icon size={17} />
                  </div>
                  <span
                    className="font-bold text-2xl"
                    style={{
                      color: '#D94444',
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {stat}
                  </span>
                </div>

                <h3 className="font-display font-semibold text-lg mb-3 leading-snug" style={{ color: 'var(--ink)' }}>
                  {headline}
                </h3>
                <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ink-soft)' }}>
                  {detail}
                </p>
                <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--ink-faint)' }}>
                  Source: {source}
                </p>
              </div>
            ))}

            {/* 6th tile to balance the grid: takes the same visual weight */}
            <div
              className="p-7 rounded-[16px] flex flex-col justify-between md:col-span-2 lg:col-span-1"
              style={{
                background: 'linear-gradient(135deg, rgba(217,68,68,0.06), rgba(217,68,68,0.02))',
                border: '1px solid var(--brand-line)',
              }}
            >
              <div>
                <p className="eyebrow mb-3" style={{ color: '#D94444' }}>The maths</p>
                <h3 className="font-display font-semibold text-lg mb-3 leading-snug" style={{ color: 'var(--ink)' }}>
                  One bad hire + one tribunal claim + one missed quarter = a year of profit gone.
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  £132,000 + £13,749 + the cost of replacing your replacement.
                  Most SMEs hit two of the three within 18 months of fast growth.
                  The third is a coin flip.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Compounding-cost graphic (option A: custom SVG) ───────── */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-[420px_1fr] gap-16 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                  style={{ background: '#D94444', verticalAlign: 'middle' }}
                />
                12 months of inaction
              </p>

              <h2
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.03em',
                  color: 'var(--ink)',
                }}
              >
                It does not stay still. It compounds.
              </h2>

              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                A modelled cost trajectory for a 25-person UK SME doing nothing for one year. Each step is one of the five risks above landing in real life. The line never goes flat.
              </p>
            </div>

            <CompoundingCostChart />
          </div>
        </div>
      </section>

      {/* ── How TPS helps: mirror the 5 pains with 5 fixes ───────── */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_460px] gap-16 items-start">
            <div className="hidden lg:block">
              <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(10,15,30,0.08)' }}>
                <Image
                  src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=920&h=1100&fit=crop"
                  alt="Two professionals reviewing a plan together"
                  width={460}
                  height={560}
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>

            <div>
              <p className="eyebrow mb-5">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                  style={{ background: '#2E8B7A', verticalAlign: 'middle' }}
                />
                How The People System fixes each one
              </p>

              <h2
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.03em',
                  color: 'var(--ink)',
                }}
              >
                Five risks. <span className="text-gradient">Five fixes.</span>
              </h2>

              <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
                One per pain above, in the same order. We do not sell pieces. The
                whole thing comes as one engagement.
              </p>

              <div className="space-y-0">
                {FIXES.map(({ icon: Icon, label, detail }) => (
                  <div
                    key={label}
                    className="flex items-start gap-5 py-5"
                    style={{ borderBottom: '1px solid var(--brand-line)' }}
                  >
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center"
                      style={{ background: 'rgba(46,139,122,0.08)', color: '#2E8B7A' }}
                    >
                      <Icon size={17} />
                    </div>
                    <div>
                      <p className="font-display font-semibold text-base mb-1" style={{ color: 'var(--ink)' }}>
                        {label}
                      </p>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────── */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide max-w-[820px] text-center">
          <h2
            className="font-display mb-5"
            style={{
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              color: 'var(--ink)',
            }}
          >
            The cheapest fix is the one you make before the bill arrives.
          </h2>
          <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
            30 minutes on a call. We tell you what is exposed, what to fix first, and
            whether you need us. No retainer, no hard sell.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/book" className="btn-gradient">Book a Call</Link>
            <Link href="/tools/hr-risk-score" className="btn-secondary">
              Run the 2-minute risk score <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

// ─── Compounding-cost SVG ──────────────────────────────────────────
//   Modelled trajectory for a 25-person UK SME doing nothing for one
//   year. The y-axis is illustrative cumulative cost. Each marker is
//   one of the five risks landing in real life.
function CompoundingCostChart() {
  // 13 monthly points (M0..M12). y values are illustrative £ thousands.
  const POINTS: Array<[number, number]> = [
    [0,  0],
    [1,  4],
    [2,  9],
    [3, 18],   // first compliance gap surfaces
    [4, 26],
    [5, 38],
    [6, 58],   // a regrettable hire leaves
    [7, 74],
    [8, 92],
    [9, 118],  // NLW change kicks in
    [10, 142],
    [11, 168],
    [12, 215], // tribunal claim filed
  ];
  const MARKERS = [
    { m: 3,  label: 'Compliance gap surfaces' },
    { m: 6,  label: 'Regrettable hire leaves' },
    { m: 9,  label: 'NLW rise hits payroll' },
    { m: 12, label: 'Tribunal claim filed' },
  ];

  // Chart dimensions
  const W = 720, H = 380;
  const PAD_L = 56, PAD_R = 16, PAD_T = 24, PAD_B = 56;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const maxY = 240; // £k ceiling for the axis

  const xFor = (m: number) => PAD_L + (m / 12) * innerW;
  const yFor = (v: number) => PAD_T + innerH - (v / maxY) * innerH;

  const linePath = POINTS
    .map(([m, v], i) => `${i === 0 ? 'M' : 'L'} ${xFor(m)} ${yFor(v)}`)
    .join(' ');

  const areaPath =
    `M ${xFor(0)} ${yFor(0)} ` +
    POINTS.map(([m, v]) => `L ${xFor(m)} ${yFor(v)}`).join(' ') +
    ` L ${xFor(12)} ${yFor(0)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Cumulative cost of doing nothing over 12 months for a 25-person UK SME"
    >
      <defs>
        <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#D94444" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#D94444" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Y-axis grid + labels */}
      {[0, 60, 120, 180, 240].map(v => (
        <g key={v}>
          <line
            x1={PAD_L} x2={W - PAD_R}
            y1={yFor(v)} y2={yFor(v)}
            stroke="rgba(10,15,30,0.06)"
            strokeDasharray={v === 0 ? '0' : '3 4'}
          />
          <text
            x={PAD_L - 12} y={yFor(v) + 4}
            textAnchor="end"
            fontSize="11"
            fill="rgba(10,15,30,0.45)"
            fontFamily="var(--font-mono), monospace"
          >
            £{v}k
          </text>
        </g>
      ))}

      {/* X-axis labels (every 3 months) */}
      {[0, 3, 6, 9, 12].map(m => (
        <text
          key={m}
          x={xFor(m)} y={H - 32}
          textAnchor="middle"
          fontSize="11"
          fill="rgba(10,15,30,0.45)"
          fontFamily="var(--font-mono), monospace"
        >
          M{m}
        </text>
      ))}

      {/* Area + line */}
      <path d={areaPath} fill="url(#costFill)" />
      <path d={linePath} fill="none" stroke="#D94444" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Markers */}
      {MARKERS.map(({ m, label }) => {
        const point = POINTS.find(p => p[0] === m)!;
        const cx = xFor(point[0]);
        const cy = yFor(point[1]);
        // alternate label position above/below to reduce overlap
        const labelAbove = m === 3 || m === 9;
        return (
          <g key={m}>
            <circle cx={cx} cy={cy} r="6" fill="#fff" stroke="#D94444" strokeWidth="2.5" />
            <text
              x={cx}
              y={labelAbove ? cy - 14 : cy + 22}
              textAnchor={m === 12 ? 'end' : 'middle'}
              fontSize="11"
              fontWeight="600"
              fill="rgba(10,15,30,0.85)"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
