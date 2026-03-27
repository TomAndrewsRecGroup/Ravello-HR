'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CalendarCheck, ChevronDown } from 'lucide-react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/Ravello%20HR-8VMlOBmWizWioaqRpHKw7BZoDcfrg1';

const BARS = [
  { label: 'Location',      val: 78, pct: '78%',  color: '#D94444' },
  { label: 'Salary',        val: 62, pct: '62%',  color: '#E8954A' },
  { label: 'Skills',        val: 45, pct: '45%',  color: '#E8B84A' },
  { label: 'Working Model', val: 80, pct: '80%',  color: '#D94444' },
  { label: 'Process',       val: 22, pct: '22%',  color: '#5A9E6F' },
];

const STATS = [
  { val: '18+', lab: 'Years of senior HR and People leadership', gold: true },
  { val: '10+', lab: 'Years in Talent and Recruitment',          gold: false },
  { val: '0',   lab: 'Tribunal outcomes on record',              gold: true },
];

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--gradient-hero)' }}
    >
      <div className="hero-mesh" />

      <div className="relative z-10 container-wide section-padding w-full pt-40 pb-24">
        <div className="grid lg:grid-cols-[1fr_460px] gap-12 xl:gap-16 items-center">

          {/* Left column */}
          <div>
            {/* Logo */}
            <div className="mb-8">
              <Image
                src={LOGO_FULL}
                alt="The People System"
                width={480}
                height={220}
                className="object-contain w-auto"
                style={{ height: '200px' }}
                priority
              />
            </div>

            <p
              className="text-[11px] font-bold uppercase tracking-[0.18em] mb-6"
              style={{ color: 'var(--ink-faint)' }}
            >
              Hire. Lead. Protect.
            </p>

            <h1
              style={{
                fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
                fontWeight: 300,
                lineHeight: 1.05,
                letterSpacing: '-0.025em',
                color: 'var(--ink)',
                marginBottom: '1.5rem',
              }}
            >
              We hire your people.<br />
              <span
                style={{
                  fontWeight: 600,
                  backgroundImage: 'linear-gradient(135deg, #EA3DC4 0%, #7C3AED 50%, #3B6FFF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                We lead your function.
              </span>{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 300, WebkitTextFillColor: 'var(--ink)' }}>
                We protect your business.
              </em>
            </h1>

            <p
              className="text-base leading-relaxed mb-2 max-w-[500px] font-medium"
              style={{ color: 'var(--ink-soft)' }}
            >
              One partner. Total control of your people function.
            </p>
            <p
              className="text-sm leading-relaxed mb-10 max-w-[480px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              Lucy leads on HR, compliance, and people strategy. Tom leads on talent and recruitment.
              Together: The People System.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mb-12">
              <Link href="/book" className="btn-gradient">
                <CalendarCheck size={16} /> Book a Free Call
              </Link>
              <Link href="/smart-hiring-system" className="btn-outline-white">
                See how HIRE works <ArrowRight size={15} />
              </Link>
            </div>

            {/* Stats */}
            <div
              className="flex flex-wrap gap-8 pt-8"
              style={{ borderTop: '1px solid var(--brand-line)' }}
            >
              {STATS.map((m) => (
                <div key={m.lab} className="group">
                  {m.gold ? (
                    /* Gold stat — quality signal */
                    <p
                      className="font-bold text-[2rem] mb-1"
                      style={{
                        fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                        background: 'var(--gold-gloss)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        letterSpacing: '-0.025em',
                        lineHeight: 1,
                      }}
                    >
                      {m.val}
                    </p>
                  ) : (
                    /* Gradient stat */
                    <p
                      className="font-bold text-[2rem] mb-1"
                      style={{
                        fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                        backgroundImage: 'linear-gradient(135deg, #EA3DC4, #7C3AED)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        letterSpacing: '-0.025em',
                        lineHeight: 1,
                      }}
                    >
                      {m.val}
                    </p>
                  )}
                  <p className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                    {m.lab}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — score card */}
          <div className="hidden lg:block">
            <div
              className="bg-white rounded-[22px] p-6 relative"
              style={{
                border: '0.5px solid rgba(7,11,29,0.09)',
                boxShadow: '0 6px 40px rgba(7,11,29,0.09), 0 1px 4px rgba(7,11,29,0.04)',
              }}
            >
              {/* Card top gradient line */}
              <div
                className="absolute top-0 left-6 right-6 h-[1.5px] rounded-b-full"
                style={{ background: 'var(--gradient)' }}
              />

              {/* Card header */}
              <div className="flex items-center justify-between mb-4 mt-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  Friction Lens™
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(217,68,68,0.09)', color: '#B03030' }}
                >
                  Sample score
                </span>
              </div>

              {/* Score */}
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  style={{
                    fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                    fontSize: '60px',
                    fontWeight: 600,
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                    color: 'var(--ink)',
                  }}
                >
                  67
                </span>
                <span className="text-base font-light" style={{ color: 'var(--ink-faint)' }}>/100</span>
              </div>

              <div
                className="flex items-center gap-2 text-xs font-semibold mb-5"
                style={{ color: '#C04444' }}
              >
                <span
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ background: '#C04444' }}
                />
                High friction. Role needs work before going live.
              </div>

              {/* Bars */}
              <div className="space-y-3.5 mb-5">
                {BARS.map((b) => (
                  <div key={b.label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{b.label}</span>
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--ink)' }}>{b.val}</span>
                    </div>
                    <div
                      className="h-[4px] rounded-full overflow-hidden"
                      style={{ background: 'var(--surface-alt)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: b.pct, background: b.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Card CTA */}
              <div className="pt-4" style={{ borderTop: '0.5px solid var(--brand-line)' }}>
                <Link
                  href="/smart-hiring-system"
                  className="flex items-center justify-between w-full text-sm font-semibold transition-colors group"
                  style={{ color: 'var(--brand-purple)' }}
                >
                  Raise a role. See the score before you go live.
                  <ArrowRight
                    size={14}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </Link>
              </div>
            </div>

            <p className="text-center text-[11px] mt-4" style={{ color: 'var(--ink-faint)' }}>
              Built into every HIRE engagement · No extra cost
            </p>
          </div>

        </div>
      </div>

      {/* Scroll nudge */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--ink-faint)' }}
        >
          Scroll
        </span>
        <ChevronDown size={14} style={{ color: 'var(--ink-faint)' }} className="animate-bounce" />
      </div>
    </section>
  );
}
