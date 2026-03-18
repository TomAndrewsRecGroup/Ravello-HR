'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CalendarCheck, ChevronDown, TrendingUp, Shield, Zap } from 'lucide-react';
import { useEffect, useRef } from 'react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/7f6a1a0d-2e4a-43c4-9da9-81b6a4ffe695.png';

const BARS = [
  { label: 'Role brief quality',    val: 20, pct: 20,  color: '#D94444' },
  { label: 'Interview consistency', val: 45, pct: 45,  color: '#E8954A' },
  { label: 'Decision speed',        val: 55, pct: 55,  color: '#E8B84A' },
  { label: 'Offer management',      val: 72, pct: 72,  color: '#5A9E6F' },
  { label: 'Retention signals',     val: 18, pct: 18,  color: '#D94444' },
];

const STATS = [
  { val: '10+',  lab: 'Years senior HR expertise' },
  { val: '40%+', lab: 'Agency cost reduction' },
  { val: '0',    lab: 'Tribunal outcomes' },
];

const PILLARS = [
  { icon: TrendingUp, label: 'Smart Hiring',  color: '#7B2FBE', dot: '#9B6FD8' },
  { icon: Shield,     label: 'PolicySafe',    color: '#4B6EF5', dot: '#6B8EF8' },
  { icon: Zap,        label: 'Transformation',color: '#C026A0', dot: '#D856B8' },
];

export default function Hero() {
  const barsRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Animate progress bars on load
  useEffect(() => {
    const bars = barsRef.current?.querySelectorAll<HTMLElement>('[data-bar]');
    if (!bars) return;
    const timer = setTimeout(() => {
      bars.forEach((bar, i) => {
        setTimeout(() => {
          bar.style.width = bar.dataset.bar ?? '0%';
        }, i * 120);
      });
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  // Parallax floating circle on mousemove
  useEffect(() => {
    const circle = document.querySelector<HTMLElement>('.hero-float-circle');
    if (!circle) return;
    const handleMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 24;
      const y = (e.clientY / window.innerHeight - 0.5) * 24;
      circle.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--gradient-hero)' }}
    >
      {/* ── Background mesh ── */}
      <div className="hero-mesh" />

      {/* ── Floating parallax circle (Phase 2 / Phase 3 depth) ── */}
      <div
        className="hero-float-circle pointer-events-none absolute"
        style={{
          width: '560px',
          height: '560px',
          top: '10%',
          right: '-120px',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(123,47,190,0.12) 0%, rgba(75,110,245,0.07) 40%, transparent 70%)',
          transition: 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)',
          zIndex: 0,
        }}
      />
      {/* Secondary accent circle bottom-left */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: '400px',
          height: '400px',
          bottom: '-60px',
          left: '-80px',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(192,38,160,0.07) 0%, transparent 65%)',
          zIndex: 0,
        }}
      />

      <div className="relative z-10 container-wide section-padding w-full pt-40 pb-24">
        <div className="grid lg:grid-cols-[1fr_480px] gap-12 xl:gap-20 items-center">

          {/* ══════════ LEFT COLUMN ══════════ */}
          <div>

            {/* Phase 1+2 — Logo with pulsing glow, staggered entrance */}
            <div
              className="mb-8 hero-anim"
              style={{ animationDelay: '0ms' }}
            >
              <div className="relative inline-block">
                {/* Glow ring behind logo */}
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'radial-gradient(ellipse, rgba(123,47,190,0.18) 0%, transparent 70%)',
                    animation: 'logoPulse 3s ease-in-out infinite',
                    filter: 'blur(12px)',
                  }}
                />
                <Image
                  src={LOGO_FULL}
                  alt="Ravello HR"
                  width={600}
                  height={220}
                  className="relative object-contain w-auto"
                  style={{ height: '220px' }}
                  priority
                />
              </div>
            </div>

            {/* Phase 1 — Brand name with Playfair + animated underline */}
            <div
              className="mb-6 hero-anim"
              style={{ animationDelay: '120ms' }}
            >
              <span
                className="brand-name-hero relative inline-block"
                style={{
                  fontFamily: 'var(--font-playfair), "Playfair Display", Georgia, serif',
                  fontSize: 'clamp(1rem, 1.6vw, 1.3rem)',
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  backgroundImage: 'linear-gradient(135deg, #7B2FBE 0%, #4B6EF5 55%, #C026A0 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  paddingBottom: '6px',
                }}
              >
                Ravello HR
                {/* Animated underline accent */}
                <span
                  className="brand-underline-anim absolute bottom-0 left-0 h-[2px] rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #7B2FBE, #4B6EF5, #C026A0)',
                    width: '0%',
                    animation: 'underlineGrow 1s cubic-bezier(0.23, 1, 0.32, 1) 0.5s forwards',
                  }}
                />
              </span>
            </div>

            {/* Phase 2 — Headline with stagger */}
            <h1
              className="hero-anim"
              style={{
                animationDelay: '240ms',
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

            {/* Phase 1 — Poppins body copy */}
            <p
              className="text-base leading-relaxed mb-2 max-w-[500px] font-medium hero-anim"
              style={{
                animationDelay: '320ms',
                fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                color: 'var(--ink-soft)',
              }}
            >
              Three named systems. One senior expert. No generic consultancy.
            </p>
            <p
              className="text-sm leading-relaxed mb-8 max-w-[480px] hero-anim"
              style={{
                animationDelay: '380ms',
                fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                color: 'var(--ink-faint)',
              }}
            >
              Ravello HR permanently fixes the hiring, compliance and transformation
              challenges that slow ambitious UK businesses down.
            </p>

            {/* Phase 2+5 — Pillar badges with glow dots and hover lift */}
            <div
              className="flex flex-wrap gap-3 mb-8 hero-anim"
              style={{ animationDelay: '440ms' }}
            >
              {PILLARS.map(({ icon: Icon, label, color, dot }) => (
                <div
                  key={label}
                  className="pillar-badge flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 cursor-default"
                  style={{
                    background: `rgba(${hexToRgb(color)}, 0.08)`,
                    border: `1px solid rgba(${hexToRgb(color)}, 0.22)`,
                  }}
                >
                  {/* Pulsing glow dot */}
                  <span
                    className="pillar-dot w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{
                      background: dot,
                      boxShadow: `0 0 0 0 rgba(${hexToRgb(dot)}, 0.5)`,
                      animation: 'pillDotPulse 2.4s ease-in-out infinite',
                    }}
                  />
                  <Icon size={13} style={{ color }} />
                  <span
                    style={{
                      fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      backgroundImage: `linear-gradient(135deg, ${color}, ${dot})`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Phase 5 — Buttons with shimmer on hover */}
            <div
              className="flex flex-wrap gap-4 mb-12 hero-anim"
              style={{ animationDelay: '520ms' }}
            >
              <Link href="/book" className="btn-gradient btn-shimmer">
                <CalendarCheck size={16} /> Book a Free Call
              </Link>
              <Link href="/tools/hiring-score" className="btn-outline-white">
                Get Your Hiring Score <ArrowRight size={15} />
              </Link>
            </div>

            {/* Phase 6 — Stats with gradient values */}
            <div
              className="flex flex-wrap gap-10 pt-8 hero-anim"
              style={{
                animationDelay: '640ms',
                borderTop: '1px solid var(--brand-line)',
              }}
            >
              {STATS.map((m) => (
                <div key={m.lab}>
                  <p
                    className="font-bold text-3xl mb-1"
                    style={{
                      fontFamily: 'var(--font-playfair), "Playfair Display", Georgia, serif',
                      backgroundImage: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {m.val}
                  </p>
                  <p
                    className="text-xs"
                    style={{
                      fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {m.lab}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ══════════ RIGHT COLUMN — glassmorphism score card ══════════ */}
          <div
            className="hidden lg:block hero-anim"
            style={{ animationDelay: '760ms' }}
          >
            {/* Phase 3+4 — Asymmetric overlap card with glassmorphism */}
            <div
              className="relative"
              style={{ marginTop: '-20px' }} /* subtle upward offset for asymmetric tension */
            >
              {/* Gradient border wrapper */}
              <div
                className="rounded-[22px] p-[1.5px]"
                style={{
                  background: 'linear-gradient(135deg, rgba(123,47,190,0.6) 0%, rgba(75,110,245,0.4) 55%, rgba(192,38,160,0.5) 100%)',
                  boxShadow: '0 8px 40px rgba(123,47,190,0.22), 0 2px 8px rgba(13,21,53,0.10)',
                }}
              >
                {/* Phase 4 — Frosted glass card */}
                <div
                  className="rounded-[21px] p-6"
                  style={{
                    background: 'rgba(255, 255, 255, 0.72)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(123,47,190,0.06), 0 20px 60px rgba(13,21,53,0.12)',
                  }}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{
                        fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                        backgroundImage: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Smart Hiring System™
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                      style={{
                        background: 'linear-gradient(135deg, rgba(217,68,68,0.12), rgba(232,149,74,0.10))',
                        color: '#B03030',
                        fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                        border: '1px solid rgba(217,68,68,0.18)',
                      }}
                    >
                      Sample score
                    </span>
                  </div>

                  {/* Score — Playfair Display for luxury feel */}
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      style={{
                        fontFamily: 'var(--font-playfair), "Playfair Display", Georgia, serif',
                        fontSize: '64px',
                        fontWeight: 700,
                        lineHeight: 1,
                        letterSpacing: '-0.03em',
                        backgroundImage: 'linear-gradient(135deg, #7B2FBE 0%, #4B6EF5 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      34
                    </span>
                    <span
                      className="text-base font-light"
                      style={{
                        fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                        color: 'var(--ink-faint)',
                      }}
                    >
                      /100
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-2 text-xs font-medium mb-5"
                    style={{
                      color: '#C04444',
                      fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                    }}
                  >
                    <span
                      className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                      style={{ background: '#C04444', animation: 'pillDotPulse 2s ease-in-out infinite' }}
                    />
                    High risk — action needed
                  </div>

                  {/* Phase 2+3 — Animated progress bars */}
                  <div ref={barsRef} className="space-y-3 mb-5">
                    {BARS.map((b) => (
                      <div key={b.label}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span
                            className="text-xs"
                            style={{
                              fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                              color: 'var(--ink-soft)',
                            }}
                          >
                            {b.label}
                          </span>
                          <span
                            className="text-xs font-medium"
                            style={{
                              fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                              color: 'var(--ink)',
                            }}
                          >
                            {b.val}
                          </span>
                        </div>
                        <div
                          className="h-[5px] rounded-full overflow-hidden"
                          style={{ background: 'var(--surface-alt)' }}
                        >
                          <div
                            data-bar={`${b.pct}%`}
                            className="h-full rounded-full"
                            style={{
                              width: '0%',
                              background: `linear-gradient(90deg, ${b.color}cc, ${b.color})`,
                              transition: 'width 0.8s cubic-bezier(0.23, 1, 0.32, 1)',
                              boxShadow: `0 0 6px ${b.color}55`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Card CTA */}
                  <div
                    className="pt-4"
                    style={{ borderTop: '0.5px solid rgba(123,47,190,0.12)' }}
                  >
                    <Link
                      href="/tools/hiring-score"
                      className="flex items-center justify-between w-full text-sm font-medium transition-all duration-200 hover:gap-3"
                      style={{
                        fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                        backgroundImage: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Book a call to fix these gaps
                      <ArrowRight size={14} style={{ color: '#7B2FBE', WebkitTextFillColor: 'unset' }} />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Decorative glow beneath card */}
              <div
                className="absolute inset-x-8 bottom-0 h-8 -z-10"
                style={{
                  background: 'radial-gradient(ellipse, rgba(123,47,190,0.22) 0%, transparent 70%)',
                  filter: 'blur(12px)',
                  transform: 'translateY(8px)',
                }}
              />
            </div>

            {/* Below card reassurance */}
            <p
              className="text-center text-xs mt-5"
              style={{
                fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
                color: 'var(--ink-faint)',
              }}
            >
              Free · Takes 3 minutes · No obligation
            </p>
          </div>
        </div>
      </div>

      {/* Scroll nudge */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10">
        <span
          className="text-[10px] font-medium uppercase tracking-widest"
          style={{
            fontFamily: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
            color: 'var(--ink-faint)',
          }}
        >
          Scroll
        </span>
        <ChevronDown size={15} style={{ color: 'var(--ink-faint)' }} className="animate-bounce" />
      </div>
    </section>
  );
}

/* ── Utility: hex to rgb for inline rgba ── */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
