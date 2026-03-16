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
        <div className="grid lg:grid-cols-[1fr_560px] gap-12 xl:gap-16 items-center">

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

          {/* Right column — logo doubled in size, pills hugging edges */}
          <div className="hidden lg:flex flex-col items-center justify-center relative" style={{ minHeight: '480px' }}>

            {/* Glow rings scaled to match */}
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: '520px', height: '520px',
                background: 'radial-gradient(circle, rgba(124,92,246,0.15) 0%, rgba(91,155,255,0.06) 40%, transparent 70%)',
                border: '1px solid rgba(124,92,246,0.09)',
              }}
            />
            <div
              className="absolute rounded-full pointer-events-none"
              style={{ width: '370px', height: '370px', border: '1px solid rgba(91,155,255,0.07)' }}
            />

            {/* Full logo — doubled: was ~100% of 520px col, now fills full 560px column */}
            <div className="relative z-10 w-full px-2">
              <Image
                src={LOGO_FULL}
                alt="Ravello HR"
                width={1120}
                height={420}
                className="object-contain w-full drop-shadow-2xl"
                priority
              />
            </div>

            {/*
              Pills hug the logo:
              Logo aspect ratio ~1120:420 = 2.67:1
              At 560px column width, logo renders ~560 x 210px
              Centre is at y=240px of 480px container
              Logo top edge ≈ 240 - 105 = 135px  → pill sits just above: top ~108px
              Logo bottom edge ≈ 240 + 105 = 345px → pill sits just below: bottom ~108px
              Left/right edges flush with column, pills offset inward
            */}

            {/* Smart Hiring System — top-left, just above logo */}
            <div
              className="absolute z-20 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-sm"
              style={{
                top: '14%',
                left: '2%',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.9)',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 14px rgba(0,0,0,0.25)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#9B7FF8' }} />
              Smart Hiring System\u2122
            </div>

            {/* PolicySafe — right, vertically centred with logo */}
            <div
              className="absolute z-20 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-sm"
              style={{
                top: '50%',
                right: '0%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.9)',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 14px rgba(0,0,0,0.25)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#5B9BFF' }} />
              PolicySafe\u2122
            </div>

            {/* DealReady People — bottom-left, just below logo */}
            <div
              className="absolute z-20 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-sm"
              style={{
                bottom: '14%',
                left: '2%',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.9)',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 14px rgba(0,0,0,0.25)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#E07FC0' }} />
              DealReady People\u2122
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
