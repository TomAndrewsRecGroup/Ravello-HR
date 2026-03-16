'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CalendarCheck, ChevronDown } from 'lucide-react';

const LOGO_MARK = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

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
      {/* Animated mesh */}
      <div className="hero-mesh" />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(13,21,53,0.6))' }}
      />

      <div className="relative z-10 container-wide section-padding w-full pt-40 pb-28">
        <div className="grid lg:grid-cols-[1fr_380px] gap-16 xl:gap-24 items-center">

          {/* Left — copy */}
          <div>
            {/* Badge */}
            <div className="flex items-center gap-3 mb-8">
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

            {/* Headline */}
            <h1
              className="font-extrabold text-white mb-7"
              style={{ fontSize: 'clamp(2.9rem, 6vw, 5.2rem)', lineHeight: 1.03, letterSpacing: '-0.03em' }}
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

            {/* Sub copy */}
            <p className="text-lg leading-relaxed mb-3 max-w-[560px] font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Three named systems. One senior expert. No generic consultancy.
            </p>
            <p className="text-base leading-relaxed mb-12 max-w-[520px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Ravello HR permanently fixes the hiring, compliance and transformation
              challenges that slow ambitious UK businesses down.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mb-14">
              <Link href="/book" className="btn-gradient">
                <CalendarCheck size={16} /> Book a Free Call
              </Link>
              <Link href="/tools/hiring-score" className="btn-outline-white">
                Get Your Hiring Score <ArrowRight size={15} />
              </Link>
            </div>

            {/* System tags */}
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

            {/* Stats */}
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

          {/* Right — large logo mark */}
          <div className="hidden lg:flex flex-col items-center justify-center relative">
            {/* Glow ring */}
            <div
              className="absolute w-[340px] h-[340px] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(124,92,246,0.18) 0%, rgba(91,155,255,0.08) 40%, transparent 70%)', border: '1px solid rgba(124,92,246,0.12)' }}
            />
            <div
              className="absolute w-[250px] h-[250px] rounded-full pointer-events-none"
              style={{ border: '1px solid rgba(91,155,255,0.1)' }}
            />

            {/* Logo mark — large */}
            <div className="relative z-10 p-8">
              <Image
                src={LOGO_MARK}
                alt="Ravello HR"
                width={320}
                height={140}
                className="object-contain drop-shadow-2xl"
                priority
              />
            </div>

            {/* Floating system pills */}
            {[
              { label: 'Smart Hiring System™', pos: { top: '4%',  left: '-14%' }, dot: '#9B7FF8' },
              { label: 'PolicySafe™',           pos: { top: '44%', right: '-16%' }, dot: '#5B9BFF' },
              { label: 'DealReady People™',     pos: { top: '80%', left: '-8%'  }, dot: '#E07FC0' },
            ].map((p) => (
              <div
                key={p.label}
                className="absolute flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold bg-white/10 backdrop-blur-sm"
                style={{
                  ...p.pos,
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.dot }} />
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
