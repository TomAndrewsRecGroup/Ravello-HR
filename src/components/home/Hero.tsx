'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CalendarCheck, ChevronDown } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

const SYSTEMS = [
  { label: 'Smart Hiring System™', color: 'var(--brand-purple)' },
  { label: 'PolicySafe™',          color: 'var(--brand-blue)' },
  { label: 'DealReady People™',    color: 'var(--brand-pink)' },
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
      style={{ background: 'var(--brand-navy)' }}
    >
      {/* Animated mesh glows */}
      <div className="hero-mesh" />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      {/* Gradient fade to bg at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--brand-navy))' }}
      />

      {/* Content */}
      <div className="relative z-10 container-wide section-padding w-full pt-36 pb-24">
        <div className="max-w-[820px]">

          {/* Eyebrow badge */}
          <div className="flex items-center gap-3 mb-8">
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: 'rgba(143,114,246,0.15)',
                border: '1px solid rgba(143,114,246,0.3)',
                color: 'rgba(200,185,255,0.95)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--brand-purple)' }} />
              UK HR Consultancy
            </span>
          </div>

          {/* Headline */}
          <h1
            className="font-display font-extrabold mb-7 leading-[1.03] tracking-[-0.025em] text-white"
            style={{ fontSize: 'clamp(2.8rem, 6vw, 5rem)' }}
          >
            The HR expertise<br />
            your business{' '}
            <span className="text-gradient">actually needs.</span>
          </h1>

          {/* Sub copy */}
          <p
            className="text-lg leading-relaxed mb-4 max-w-[600px]"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            Three named systems. One senior expert. No generic consultancy.
          </p>
          <p
            className="text-base leading-relaxed mb-12 max-w-[560px]"
            style={{ color: 'rgba(255,255,255,0.42)' }}
          >
            Ravello HR permanently fixes the hiring, compliance and transformation
            challenges that slow ambitious UK businesses down.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 mb-16">
            <Link href="/book" className="btn-gradient">
              <CalendarCheck size={16} />
              Book a Free Call
            </Link>
            <Link href="/tools/hiring-score" className="btn-outline-white">
              Get Your Hiring Score <ArrowRight size={16} />
            </Link>
          </div>

          {/* System pills */}
          <div className="flex flex-wrap gap-2.5 mb-16">
            {SYSTEMS.map((s) => (
              <span
                key={s.label}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>

          {/* Micro stats row */}
          <div
            className="flex flex-wrap gap-10 pt-8"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {STATS.map((m) => (
              <div key={m.lab}>
                <p
                  className="font-display font-extrabold text-3xl mb-1"
                  style={{
                    background: 'var(--gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {m.val}
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{m.lab}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll nudge */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10">
        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Scroll</span>
        <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.3)' }} className="animate-bounce" />
      </div>
    </section>
  );
}
