'use client';
import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

const metrics = [
  { value: '40%', label: 'Agency spend cut' },
  { value: '8wk',  label: 'Avg time-to-hire saved' },
  { value: '0',    label: 'Tribunal outcomes' },
  { value: '3',    label: 'Named HR systems' },
];

const pillars = [
  { tag: '[A]', label: 'Smart Hiring System™', href: '/smart-hiring-system', color: 'border-brand-violet text-brand-violet' },
  { tag: '[B]', label: 'PolicySafe™',           href: '/policysafe',          color: 'border-brand-pink text-brand-pink' },
  { tag: '[C]', label: 'DealReady People™',     href: '/dealready-people',    color: 'border-brand-cyan text-brand-cyan' },
];

export default function Hero() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center bg-brand-void overflow-hidden">

      {/* Cyber grid */}
      <div className="absolute inset-0 cyber-grid opacity-100" />

      {/* Radial glow centre */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(107,33,255,0.18) 0%, transparent 70%)' }}
      />

      {/* Bottom right glow blob */}
      <div
        className="absolute bottom-0 right-0 w-[600px] h-[600px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 100% 100%, rgba(224,64,251,0.12) 0%, transparent 60%)' }}
      />

      {/* Scanline */}
      <div className="scanline" />

      {/* Corner accents */}
      <div className="absolute top-24 left-6 w-8 h-8 border-l-2 border-t-2 border-brand-violet/50" />
      <div className="absolute top-24 right-6 w-8 h-8 border-r-2 border-t-2 border-brand-violet/50" />
      <div className="absolute bottom-8 left-6 w-8 h-8 border-l-2 border-b-2 border-brand-pink/40" />
      <div className="absolute bottom-8 right-6 w-8 h-8 border-r-2 border-b-2 border-brand-pink/40" />

      <div className="relative z-10 container-wide section-padding w-full">
        <div className="max-w-5xl">

          {/* System tag */}
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-brand-violet text-xs tracking-widest">// RAVELLO_HR.SYS</span>
            <span className="w-2 h-2 rounded-full bg-brand-violet animate-pulse" />
            <span className="font-mono text-brand-slate text-xs">v3.0.0 · UK HR SYSTEMS</span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-5xl sm:text-6xl lg:text-8xl font-bold leading-none mb-6 tracking-wide">
            <span className="block text-white">HIRE.</span>
            <span className="block text-gradient">LEAD.</span>
            <span className="block text-white">PROTECT.</span>
          </h1>

          <p className="text-white/60 text-lg lg:text-xl max-w-2xl mb-4 leading-relaxed">
            Three named HR systems. One expert. Zero generic advice.
          </p>
          <p className="text-white/40 text-base max-w-xl mb-10">
            Ravello HR fixes the hiring, compliance and transformation challenges that slow ambitious businesses down — permanently.
          </p>

          {/* CTA row */}
          <div className="flex flex-wrap gap-4 mb-14">
            <Link href="/tools/hiring-score" className="btn-primary">
              <Zap size={16} /> Get Your Hiring Score
            </Link>
            <Link href="/book" className="btn-outline">
              Book Free Call <ArrowRight size={16} />
            </Link>
          </div>

          {/* Pillar pills */}
          <div className="flex flex-wrap gap-3 mb-16">
            {pillars.map((p) => (
              <Link key={p.href} href={p.href}
                className={`flex items-center gap-2 px-4 py-2 border text-xs font-mono font-semibold tracking-wider transition-all hover:bg-white/5 ${p.color}`}
                style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
              >
                <span className="opacity-60">{p.tag}</span>
                {p.label}
                <ArrowRight size={12} className="opacity-60" />
              </Link>
            ))}
          </div>

          {/* Metrics bar */}
          <div className="border-t border-brand-violet/20 pt-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {metrics.map((m) => (
                <div key={m.label}>
                  <p className="font-display font-bold text-3xl text-gradient">{m.value}</p>
                  <p className="text-brand-slate text-xs font-mono uppercase tracking-wider mt-1">{m.label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Right side decorative panel (desktop) */}
      <div className="hidden xl:flex absolute right-8 top-1/2 -translate-y-1/2 flex-col gap-3">
        {['HIRING', 'COMPLIANCE', 'M&A RISK', 'CHANGE'].map((item, i) => (
          <div key={item}
            className="flex items-center gap-2 px-3 py-1.5 border border-brand-violet/20 bg-brand-panel/50"
            style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
          >
            <span className="w-1 h-1 rounded-full bg-brand-violet animate-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
            <span className="font-mono text-xs text-brand-slate tracking-widest">{item}</span>
          </div>
        ))}
      </div>

    </section>
  );
}
