'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CalendarCheck, ChevronDown } from 'lucide-react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/7f6a1a0d-2e4a-43c4-9da9-81b6a4ffe695.png';

const SYSTEMS = [
  { label: 'Smart Hiring System™', color: '#9B7FF8' },
  { label: 'PolicySafe™',          color: '#5B9BFF' },
  { label: 'DealReady People™',    color: '#E07FC0' },
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

      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(13,21,53,0.6))' }}
      />

      <div className="relative z-10 container-wide section-padding w-full pt-44 pb-28">
        <div className="grid lg:grid-cols-[1fr_520px] gap-12 xl:gap-20 items-center">

          {/* Left column */}
          <div>
            <div className="flex items-center gap-3 mb-9">
              <span
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'rgba(124,92,246,0.18)',
                  border: '1px solid rgba(124,92,246,0.35)',
                  color: 'rgba(210,195,255,0.95)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#9B7FF8' }} />
                UK HR Consultancy
              </span>
            </div>

            <h1
              className="font-extrabold text-white mb-7"
              style={{ fontSize: 'clamp(2.6rem, 5.5vw, 4.8rem)', lineHeight: 1.04, letterSpacing: '-0.03em' }}
            >
              The HR expertise<br />
              your business{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, #9B7FF8 0%, #5B9BFF 60%, #E07FC0 100%)' }}
              >
                actually needs.
              </span>
            </h1>

            <p className="text-lg leading-relaxed mb-3 max-w-[540px] font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Three named systems. One senior expert. No generic consultancy.
            </p>
            <p className="text-base leading-relaxed mb-12 max-w-[500px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Ravello HR permanently fixes the hiring, compliance and transformation
              challenges that slow ambitious UK businesses down.
            </p>

            <div className="flex flex-wrap gap-4 mb-14">
              <Link href="/book" className="btn-gradient">
                <CalendarCheck size={16} /> Book a Free Call
              </Link>
              <Link href="/tools/hiring-score" className="btn-outline-white">
                Get Your Hiring Score <ArrowRight size={15} />
              </Link>
            </div>

            <div className="flex flex-wrap gap-2.5 mb-14">
              {SYSTEMS.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.72)',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-10 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.09)' }}>
              {STATS.map((m) => (
                <div key={m.lab}>
                  <p
                    className="font-extrabold text-3xl mb-1"
                    style={{ background: 'linear-gradient(135deg,#9B7FF8,#5B9BFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                  >
                    {m.val}
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>{m.lab}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — full logo tripled in size + floating pills */}
          <div className="hidden lg:flex flex-col items-center justify-center relative min-h-[520px]">

            {/* Glow rings — scaled up to match larger logo */}
            <div
              className="absolute w-[580px] h-[580px] rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(124,92,246,0.16) 0%, rgba(91,155,255,0.07) 40%, transparent 70%)',
                border: '1px solid rgba(124,92,246,0.1)',
              }}
            />
            <div
              className="absolute w-[420px] h-[420px] rounded-full pointer-events-none"
              style={{ border: '1px solid rgba(91,155,255,0.08)' }}
            />

            {/* Full logo — tripled: was ~380px wide, now 1140px capped to column */}
            <div className="relative z-10 px-4 py-6 w-full flex items-center justify-center">
              <Image
                src={LOGO_FULL}
                alt="Ravello HR"
                width={1140}
                height={420}
                className="object-contain drop-shadow-2xl w-full"
                style={{ maxWidth: '100%' }}
                priority
              />
            </div>

            {/* Floating system pills */}
            {[
              { label: 'Smart Hiring System™', pos: { top: '4%',   left: '-8%'  }, dot: '#9B7FF8' },
              { label: 'PolicySafe™',           pos: { top: '48%',  right: '-10%' }, dot: '#5B9BFF' },
              { label: 'DealReady People™',     pos: { bottom: '4%', left: '-4%' },  dot: '#E07FC0' },
            ].map((p) => (
              <div
                key={p.label}
                className="absolute flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-sm"
                style={{
                  ...p.pos,
                  background: 'rgba(255,255,255,0.09)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 14px rgba(0,0,0,0.22)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.dot }} />
                {p.label}
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Scroll nudge */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10">
        <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.28)' }}>Scroll</span>
        <ChevronDown size={15} style={{ color: 'rgba(255,255,255,0.28)' }} className="animate-bounce" />
      </div>
    </section>
  );
}
