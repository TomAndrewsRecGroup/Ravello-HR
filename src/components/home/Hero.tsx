'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CalendarCheck, ChevronDown } from 'lucide-react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/Ravello%20HR-8VMlOBmWizWioaqRpHKw7BZoDcfrg1';

const BARS = [
  { label: 'Role brief quality',     val: 20, pct: '20%',  color: '#D94444' },
  { label: 'Interview consistency',  val: 45, pct: '45%',  color: '#E8954A' },
  { label: 'Decision speed',         val: 55, pct: '55%',  color: '#E8B84A' },
  { label: 'Offer management',       val: 72, pct: '72%',  color: '#5A9E6F' },
  { label: 'Retention signals',      val: 18, pct: '18%',  color: '#D94444' },
];

const STATS = [
  { val: '10+',  lab: 'Years senior HR expertise' },
  { val: '40%+', lab: 'Agency cost reduction' },
  { val: '0',    lab: 'Tribunal outcomes' },
];

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--gradient-hero)' }}
    >
      <div className="hero-mesh" />

      <div className="relative z-10 container-wide section-padding w-full pb-24" style={{ paddingTop: '112px' }}>
        <div className="grid lg:grid-cols-[1fr_460px] gap-12 xl:gap-16 items-center">

          {/* Left column */}
          <div>

            {/* Logo — replaces the eyebrow tag */}
            <div style={{ marginBottom: '26px' }}>
              <Image
                src={LOGO_FULL}
                alt="Ravello HR"
                width={1280}
                height={440}
                className="object-contain w-auto"
                style={{ height: '440px' }}
                priority
              />
            </div>

            <h1
              style={{
                fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
                fontWeight: 300,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                marginBottom: '1.5rem',
              }}
            >
              Your people problems<br />
              <span
                style={{
                  fontWeight: 600,
                  backgroundImage: 'linear-gradient(135deg, #7B2FBE 0%, #4B6EF5 55%, #C026A0 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                cost more
              </span>{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 300, WebkitTextFillColor: 'var(--ink)' }}>
                than you think.
              </em>
            </h1>

            <p className="text-base leading-relaxed mb-2 max-w-[500px] font-medium" style={{ color: 'var(--ink-soft)' }}>
              Three named systems. One senior expert. No generic consultancy.
            </p>
            <p className="text-sm leading-relaxed mb-10 max-w-[480px]" style={{ color: 'var(--ink-faint)' }}>
              Ravello HR permanently fixes the hiring, compliance and transformation
              challenges that slow ambitious UK businesses down.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Link href="/book" className="btn-gradient">
                <CalendarCheck size={16} /> Book a Free Call
              </Link>
              <Link href="/tools/hiring-score" className="btn-outline-white">
                Get Your Hiring Score <ArrowRight size={15} />
              </Link>
            </div>

            <div className="flex flex-wrap gap-10 pt-8" style={{ borderTop: '1px solid var(--brand-line)' }}>
              {STATS.map((m) => (
                <div key={m.lab}>
                  <p
                    className="font-bold text-3xl mb-1"
                    style={{
                      fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                      backgroundImage: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {m.val}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{m.lab}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — score card */}
          <div className="hidden lg:block">
            <div
              className="bg-white rounded-[18px] p-6"
              style={{
                border: '0.5px solid rgba(15,19,32,0.09)',
                boxShadow: '0 4px 32px rgba(13,21,53,0.08), 0 1px 4px rgba(13,21,53,0.04)',
              }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  Smart Hiring System™
                </span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
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
                    fontSize: '56px',
                    fontWeight: 600,
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                    color: 'var(--ink)',
                  }}
                >
                  34
                </span>
                <span className="text-base font-light" style={{ color: 'var(--ink-faint)' }}>/100</span>
              </div>

              <div
                className="flex items-center gap-2 text-xs font-medium mb-5"
                style={{ color: '#C04444' }}
              >
                <span
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ background: '#C04444' }}
                />
                High risk — action needed
              </div>

              {/* Bars */}
              <div className="space-y-3 mb-5">
                {BARS.map((b) => (
                  <div key={b.label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{b.label}</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{b.val}</span>
                    </div>
                    <div
                      className="h-[5px] rounded-full overflow-hidden"
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
              <div
                className="pt-4"
                style={{ borderTop: '0.5px solid var(--brand-line)' }}
              >
                <Link
                  href="/tools/hiring-score"
                  className="flex items-center justify-between w-full text-sm font-medium transition-colors"
                  style={{ color: 'var(--brand-purple)' }}
                >
                  Book a call to fix these gaps
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Below card — subtle reassurance */}
            <p className="text-center text-xs mt-4" style={{ color: 'var(--ink-faint)' }}>
              Free · Takes 3 minutes · No obligation
            </p>
          </div>

        </div>
      </div>

      {/* Scroll nudge */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10">
        <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Scroll</span>
        <ChevronDown size={15} style={{ color: 'var(--ink-faint)' }} className="animate-bounce" />
      </div>
    </section>
  );
}
