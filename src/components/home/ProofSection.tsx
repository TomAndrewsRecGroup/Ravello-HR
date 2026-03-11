import { TrendingDown, Clock, Shield, Users } from 'lucide-react';

const stats = [
  { icon: TrendingDown, value: '40–60%', label: 'Agency spend reduction',   sub: 'on repeatable roles within 12 months' },
  { icon: Clock,        value: '8 weeks', label: 'Time-to-hire saved',         sub: 'by removing low-signal process steps' },
  { icon: Shield,       value: '0',       label: 'Tribunal outcomes',          sub: 'across all restructure & TUPE work' },
  { icon: Users,        value: '100s',    label: 'Employees impacted',         sub: 'across change & transformation' },
];

export default function ProofSection() {
  return (
    <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
      <div className="container-wide">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-16 items-start">

          <div>
            <p className="eyebrow mb-4" style={{ color: 'rgba(147,184,255,0.8)' }}>Proof of work</p>
            <h2 className="font-display font-bold text-white leading-tight mb-4"
              style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', letterSpacing: '-0.02em' }}
            >
              Results, not promises.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Names stay confidential. Outcomes don’t.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {stats.map((s) => (
              <div key={s.label}
                className="rounded-[16px] p-6"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <s.icon size={18} className="mb-4" style={{ color: 'var(--brand-purple)' }} />
                <p className="font-display font-bold text-3xl text-white mb-1">{s.value}</p>
                <p className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{s.label}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
