'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CalendarCheck, ChevronDown } from 'lucide-react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/7f6a1a0d-2e4a-43c4-9da9-81b6a4ffe695.png';

const SYSTEMS = [
  { label: 'Smart Hiring System\u2122', color: '#9B7FF8' },
  { label: 'PolicySafe\u2122',          color: '#5B9BFF' },
  { label: 'DealReady People\u2122',    color: '#E07FC0' },
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
        <div className="grid lg:grid-cols-[1fr_600px] gap-10 xl:gap-14 items-center">

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

          {/* Right column */}
          <div className="hidden lg:flex flex-col items-center justify-center gap-6">

            {/* Pill — above logo */}
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold self-start ml-2"
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.9)',
                boxShadow: '0 2px 14px rgba(0,0,0,0.25)',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#9B7FF8' }} />
              Smart Hiring System™
            </div>

            {/* Logo — doubled: 320px → 640px */}
            <div
              className="relative w-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(124,92,246,0.2) 0%, rgba(91,155,255,0.08) 50%, transparent 75%)',
                borderRadius: '10px',
                minHeight: '980px',
              }}
            >
              <Image
                src={LOGO_FULL}
                alt="Ravello HR"
                width={1800}
                height={720}
                className="object-contain drop-shadow-2xl"
                style={{ width: '100%', height: '980px' }}
                priority
              />
            </div>

            {/* Pills — below logo, side by side */}
            <div className="flex items-center justify-between w-full px-2 gap-3">
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 2px 14px rgba(0,0,0,0.25)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#5B9BFF' }} />
                PolicySafe™
              </div>
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 2px 14px rgba(0,0,0,0.25)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#E07FC0' }} />
                DealReady People™
              </div>
            </div>

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
