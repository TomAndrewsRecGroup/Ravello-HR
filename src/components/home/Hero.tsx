import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Radial glow behind logo area */}
      <div className="absolute right-0 top-0 w-[700px] h-[700px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 30%, rgba(143,114,246,0.1) 0%, rgba(147,184,255,0.07) 40%, transparent 70%)' }}
      />
      <div className="absolute left-0 bottom-0 w-[500px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(232,182,217,0.08) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 container-wide section-padding w-full">
        <div className="grid lg:grid-cols-[1fr_420px] gap-16 xl:gap-24 items-center">

          {/* Left */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="eyebrow">Ravello HR</span>
              <span className="w-8 h-px" style={{ background: 'var(--gradient)' }} />
              <span className="eyebrow" style={{ color: 'var(--ink-faint)' }}>UK People Consultancy</span>
            </div>

            <h1 className="font-display font-bold mb-6 leading-[1.04] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(2.8rem, 6vw, 5rem)', color: 'var(--ink)' }}
            >
              The HR expertise
              your business <span className="text-gradient">actually needs.</span>
            </h1>

            <p className="text-lg leading-relaxed mb-4 max-w-[520px]" style={{ color: 'var(--ink-soft)' }}>
              Three named systems. One senior expert. No generic consultancy.
            </p>
            <p className="text-base leading-relaxed mb-10 max-w-[480px]" style={{ color: 'var(--ink-faint)' }}>
              Ravello HR fixes the hiring, compliance and transformation challenges that slow ambitious businesses down — permanently.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/book" className="btn-primary">
                Book a Free Call <ArrowRight size={16} />
              </Link>
              <Link href="/tools/hiring-score" className="btn-secondary">
                Get Your Hiring Score
              </Link>
            </div>

            {/* Micro proof */}
            <div className="flex flex-wrap items-center gap-6 mt-10 pt-8" style={{ borderTop: '1px solid var(--brand-line)' }}>
              {[
                { val: '10+',  lab: 'Years experience' },
                { val: '40%+', lab: 'Agency cost reduction' },
                { val: '0',    lab: 'Tribunal outcomes' },
              ].map((m) => (
                <div key={m.lab}>
                  <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{m.val}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{m.lab}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — brand visual */}
          <div className="hidden lg:flex items-center justify-center relative">
            {/* Outer soft ring */}
            <div className="absolute w-[380px] h-[380px] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(143,114,246,0.08) 0%, transparent 70%)',
                border: '1px solid rgba(143,114,246,0.12)',
              }}
            />
            {/* Mid ring */}
            <div className="absolute w-[280px] h-[280px] rounded-full"
              style={{ border: '1px solid rgba(147,184,255,0.15)' }}
            />

            {/* Logo mark */}
            <div className="relative z-10 w-[160px] h-[160px] flex items-center justify-center">
              <div className="absolute inset-0 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(143,114,246,0.12) 0%, transparent 70%)' }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-icon.png" alt="Ravello HR" className="w-28 h-28 object-contain relative z-10" />
            </div>

            {/* Floating credential pills */}
            {[
              { label: 'Smart Hiring System™', top: '8%',  left: '-10%',  accent: 'var(--brand-purple)' },
              { label: 'PolicySafe™',           top: '30%', right: '-12%', accent: 'var(--brand-blue)' },
              { label: 'DealReady People™',     top: '68%', left: '-8%',   accent: 'var(--brand-pink)' },
            ].map((p) => (
              <div key={p.label}
                className="absolute flex items-center gap-2 bg-white px-3.5 py-2 rounded-full text-xs font-semibold"
                style={{
                  top: p.top, left: p.left, right: (p as any).right,
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 2px 12px rgba(14,22,51,0.08)',
                  color: 'var(--ink)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.accent }} />
                {p.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
