import { TrendingDown, Clock, ShieldCheck, Users } from 'lucide-react';

const stats = [
  {
    icon: TrendingDown,
    value: '40–60%',
    label: 'Agency spend reduction',
    sub: 'on repeatable roles within 12 months',
    color: 'var(--brand-purple)',
    glow: 'rgba(143,114,246,0.2)',
  },
  {
    icon: Clock,
    value: '8 weeks',
    label: 'Time-to-hire saved',
    sub: 'by removing low-signal process steps',
    color: 'var(--brand-blue)',
    glow: 'rgba(147,184,255,0.2)',
  },
  {
    icon: ShieldCheck,
    value: '0',
    label: 'Tribunal outcomes',
    sub: 'across all restructure & TUPE work',
    color: 'var(--brand-pink)',
    glow: 'rgba(232,182,217,0.25)',
  },
  {
    icon: Users,
    value: '100s',
    label: 'Employees impacted',
    sub: 'across change & transformation',
    color: 'var(--brand-purple)',
    glow: 'rgba(143,114,246,0.2)',
  },
];

export default function ProofSection() {
  return (
    <section className="section-padding relative overflow-hidden" style={{ background: 'var(--brand-navy)' }}>

      {/* Background glows */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(143,114,246,0.12) 0%, transparent 60%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(147,184,255,0.08) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 container-wide">

        {/* Header */}
        <div className="grid lg:grid-cols-[1fr_2fr] gap-16 items-start mb-16">
          <div>
            <p className="eyebrow-light mb-4">Proof of work</p>
            <h2
              className="font-display font-bold text-white leading-tight mb-4"
              style={{ fontSize: 'clamp(1.9rem, 3vw, 2.6rem)', letterSpacing: '-0.02em' }}
            >
              Results, not promises.
            </h2>
            <span className="accent-line-lg mb-6" />
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Names stay confidential. Outcomes don't.
            </p>
          </div>

          <div className="flex items-center">
            <p
              className="text-base leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              Every engagement we take on is measured against real outcomes — not activity. These numbers reflect client work across hiring, compliance and people transformation.
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="card-dark group cursor-default"
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-5"
                  style={{ background: `${s.glow}`, border: `1px solid ${s.color}30` }}
                >
                  <Icon size={18} style={{ color: s.color }} />
                </div>

                {/* Value */}
                <p
                  className="font-display font-extrabold mb-1"
                  style={{
                    fontSize: 'clamp(1.8rem, 2.5vw, 2.4rem)',
                    background: 'var(--gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {s.value}
                </p>

                <p className="text-sm font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {s.label}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.32)' }}>
                  {s.sub}
                </p>

                {/* Bottom accent */}
                <div
                  className="mt-5 h-px w-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${s.color}, transparent)` }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
