import { TrendingDown, Clock, ShieldCheck, Users } from 'lucide-react';

const stats = [
  { icon: TrendingDown, value: '40–60%',  label: 'Agency spend reduction', sub: 'on repeatable roles within 12 months', color: '#9B7FF8', glow: 'rgba(124,92,246,0.18)' },
  { icon: Clock,        value: '8 weeks', label: 'Time-to-hire saved',       sub: 'by removing low-signal process steps',  color: '#5B9BFF', glow: 'rgba(91,155,255,0.18)' },
  { icon: ShieldCheck,  value: '0',       label: 'Tribunal outcomes',         sub: 'across all restructure & TUPE work',     color: '#E07FC0', glow: 'rgba(224,127,192,0.2)' },
  { icon: Users,        value: '100s',    label: 'Employees impacted',        sub: 'across change & transformation',          color: '#9B7FF8', glow: 'rgba(124,92,246,0.18)' },
];

export default function ProofSection() {
  return (
    <section className="section-padding relative overflow-hidden" style={{ background: 'var(--brand-navy)' }}>
      <div className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(124,92,246,0.14) 0%, transparent 60%)' }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(91,155,255,0.1) 0%, transparent 60%)' }} />

      <div className="relative z-10 container-wide">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-16 items-start mb-16">
          <div>
            <p className="eyebrow-light mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: '#9B7FF8', verticalAlign: 'middle' }} />
              Proof of work
            </p>
            <h2 className="section-title-light mb-5">Results, not promises.</h2>
            <span className="accent-line-lg mb-6" style={{ display: 'block' }} />
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>Names stay confidential. Outcomes don’t.</p>
          </div>
          <div className="flex items-center">
            <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.52)' }}>
              Every engagement we take on is measured against real outcomes — not activity. These numbers reflect client work across hiring, compliance and people transformation.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card-dark">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-5" style={{ background: s.glow, border: `1px solid ${s.color}35` }}>
                  <Icon size={18} style={{ color: s.color }} />
                </div>
                <p className="font-extrabold mb-1" style={{ fontSize: 'clamp(1.9rem,2.5vw,2.5rem)', background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {s.value}
                </p>
                <p className="text-sm font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.78)' }}>{s.label}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.32)' }}>{s.sub}</p>
                <div className="mt-5 h-px rounded-full" style={{ background: `linear-gradient(90deg, ${s.color}, transparent)` }} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
