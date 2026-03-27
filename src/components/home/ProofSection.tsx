import { TrendingDown, Clock, ShieldCheck, Users } from 'lucide-react';

const stats = [
  {
    icon: TrendingDown,
    value: '40–60%',
    label: 'Agency spend reduction',
    sub: 'on repeatable roles within 12 months',
    color: '#A67DFF',
    glow: 'rgba(124,58,237,0.18)',
    gold: false,
  },
  {
    icon: Clock,
    value: '8 weeks',
    label: 'Time-to-hire reduction',
    sub: 'by cutting low-signal steps from the process',
    color: '#7AADFF',
    glow: 'rgba(59,111,255,0.18)',
    gold: false,
  },
  {
    icon: ShieldCheck,
    value: '0',
    label: 'Tribunal outcomes',
    sub: 'across every restructure and TUPE engagement',
    color: 'var(--brand-gold)',
    glow: 'rgba(191,143,40,0.18)',
    gold: true,  /* Gold: highest quality signal */
  },
  {
    icon: Users,
    value: '100s',
    label: 'Employees impacted',
    sub: 'across change & transformation',
    color: '#A67DFF',
    glow: 'rgba(124,58,237,0.18)',
    gold: false,
  },
];

export default function ProofSection() {
  return (
    <section
      className="section-padding relative overflow-hidden"
      style={{ background: 'var(--brand-navy)' }}
    >
      {/* Ambient glows */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(124,58,237,0.14) 0%, transparent 60%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(59,111,255,0.10) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 container-wide">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-16 items-start mb-16">
          <div>
            <p className="eyebrow-light mb-5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: '#A67DFF', verticalAlign: 'middle' }}
              />
              Proof of work
            </p>
            <h2 className="section-title-light mb-5">Results you can point to.</h2>
            <span className="accent-line-lg mb-6" style={{ display: 'block' }} />
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Names stay confidential. The numbers speak for themselves.
            </p>
          </div>
          <div className="flex items-center">
            <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.50)' }}>
              Every engagement is measured on outcomes. Not activity.
              These figures come from real client work across hiring, compliance, and people transformation.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="card-dark"
                style={s.gold ? { border: '1px solid rgba(191,143,40,0.22)' } : {}}
              >
                {/* Icon box */}
                <div
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-5"
                  style={{
                    background: s.glow,
                    border: `1px solid ${s.color}40`,
                  }}
                >
                  <Icon size={18} style={{ color: s.color }} />
                </div>

                {/* Value */}
                {s.gold ? (
                  <p
                    className="font-extrabold mb-1"
                    style={{
                      fontSize: 'clamp(1.9rem, 2.5vw, 2.5rem)',
                      background: 'var(--gold-gloss)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {s.value}
                  </p>
                ) : (
                  <p
                    className="font-extrabold mb-1"
                    style={{
                      fontSize: 'clamp(1.9rem, 2.5vw, 2.5rem)',
                      background: 'var(--gradient)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {s.value}
                  </p>
                )}

                <p className="text-sm font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  {s.label}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.30)' }}>
                  {s.sub}
                </p>

                {/* Bottom accent line */}
                <div
                  className="mt-5 h-[1.5px] rounded-full"
                  style={{
                    background: s.gold
                      ? 'var(--gold-surface)'
                      : `linear-gradient(90deg, ${s.color}, transparent)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
