import { TrendingDown, Clock, Shield, Users } from 'lucide-react';

const stats = [
  { icon: TrendingDown, value: '40-60%', label: 'Agency spend reduction', sub: 'on repeatable roles within 12 months', color: 'text-brand-violet' },
  { icon: Clock,        value: '8 weeks', label: 'Avg time-to-hire saved', sub: 'by removing low-signal process steps',  color: 'text-brand-pink' },
  { icon: Shield,       value: '0',       label: 'Tribunal outcomes',      sub: 'across all restructure & TUPE work',    color: 'text-brand-cyan' },
  { icon: Users,        value: '100s',    label: 'Employees impacted',     sub: 'across change & transformation programmes', color: 'text-brand-violet' },
];

const sectors = [
  'Retail & Consumer',
  'Professional Services',
  'PE-backed SMEs',
  'Technology Scale-ups',
  'Manufacturing',
  'Healthcare & Services',
];

export default function ProofSection() {
  return (
    <section className="section-padding bg-brand-deep relative overflow-hidden">
      <div className="absolute inset-0 cyber-grid opacity-30" />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #6B21FF, #E040FB, transparent)' }} />

      <div className="relative z-10 container-wide">
        <div className="text-center mb-14">
          <p className="font-mono text-brand-violet text-xs uppercase tracking-widest mb-3">// Proof of work</p>
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-white">Results, not promises.</h2>
        </div>

        {/* Stats grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
          {stats.map((s) => (
            <div key={s.label}
              className="bg-brand-panel border border-brand-muted/30 p-6 relative group hover:border-brand-violet/40 transition-all"
              style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}
            >
              <s.icon className={`${s.color} mb-3 opacity-70`} size={22} />
              <p className={`font-display font-bold text-4xl ${s.color} mb-1`}>{s.value}</p>
              <p className="text-white/80 text-sm font-semibold mb-1">{s.label}</p>
              <p className="text-white/30 text-xs leading-relaxed">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Sectors */}
        <div className="border border-brand-violet/20 p-6"
          style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}
        >
          <p className="font-mono text-brand-violet text-xs uppercase tracking-widest mb-4">// Sectors served</p>
          <div className="flex flex-wrap gap-3">
            {sectors.map((s) => (
              <span key={s}
                className="px-3 py-1.5 border border-brand-muted/40 text-white/50 text-xs font-mono tracking-wider"
                style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
