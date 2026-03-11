import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const funnels = [
  {
    id: 'A',
    tag: 'Smart Hiring System™',
    headline: 'Hiring is broken.',
    sub: 'Stop reopening roles. Cut agency spend. Build a process that works.',
    pain: ['Roles filled then reopened in 12 months', 'Agency fees creeping back every year', 'Candidates dropping off at offer stage'],
    cta: { label: 'Get Your Hiring Score', href: '/tools/hiring-score' },
    page: { label: 'See the System', href: '/smart-hiring-system' },
    accent: '#6B21FF',
    glow: 'rgba(107,33,255,0.15)',
    tagColor: 'text-brand-violet border-brand-violet/40',
  },
  {
    id: 'B',
    tag: 'PolicySafe™',
    headline: 'Compliant HR. Fast.',
    sub: 'Contracts, handbooks and policies built properly — before a gap costs you.',
    pain: ['Contracts that haven’t been updated in years', 'Managers applying different rules', 'No clear disciplinary framework'],
    cta: { label: 'Run Policy Healthcheck', href: '/tools/policy-healthcheck' },
    page: { label: 'See PolicySafe™', href: '/policysafe' },
    accent: '#E040FB',
    glow: 'rgba(224,64,251,0.15)',
    tagColor: 'text-brand-pink border-brand-pink/40',
  },
  {
    id: 'C',
    tag: 'DealReady People™',
    headline: 'Deals fail on people.',
    sub: 'People due diligence, TUPE, restructuring and integration — managed properly.',
    pain: ['Hidden employment liabilities post-close', 'TUPE mismanaged — tribunal exposure', 'Key people leave before integration starts'],
    cta: { label: 'Get DD Checklist', href: '/tools/due-diligence-checklist' },
    page: { label: 'See DealReady People™', href: '/dealready-people' },
    accent: '#4DB8FF',
    glow: 'rgba(77,184,255,0.15)',
    tagColor: 'text-brand-cyan border-brand-cyan/40',
  },
];

export default function FunnelCards() {
  return (
    <section className="section-padding bg-brand-void relative">
      {/* Grid bg */}
      <div className="absolute inset-0 cyber-grid opacity-50" />

      <div className="relative z-10 container-wide">
        <div className="text-center mb-14">
          <p className="font-mono text-brand-violet text-xs uppercase tracking-widest mb-3">// Three systems. One firm.</p>
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-white">
            Which problem are you solving?
          </h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {funnels.map((f) => (
            <div
              key={f.id}
              className="relative bg-brand-panel border border-brand-muted/30 p-7 flex flex-col transition-all duration-300 group hover:border-opacity-80"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
                boxShadow: `0 0 0 1px rgba(255,255,255,0.04), inset 0 0 40px ${f.glow}`,
              }}
            >
              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2" style={{ borderColor: f.accent }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2" style={{ borderColor: f.accent, opacity: 0.4 }} />

              {/* Tag */}
              <div className={`inline-flex items-center gap-2 mb-5 self-start border px-3 py-1 font-mono text-xs tracking-widest ${f.tagColor}`}
                style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
              >
                <span className="opacity-50">[{f.id}]</span>
                {f.tag}
              </div>

              {/* Headline */}
              <h3 className="font-display text-2xl font-bold text-white mb-2">{f.headline}</h3>
              <p className="text-white/50 text-sm mb-6 leading-relaxed">{f.sub}</p>

              {/* Pain points */}
              <ul className="space-y-2 mb-8 flex-1">
                {f.pain.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-xs text-white/40">
                    <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: f.accent }} />
                    {p}
                  </li>
                ))}
              </ul>

              {/* CTAs */}
              <div className="space-y-2 mt-auto">
                <Link href={f.cta.href}
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold text-white transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${f.accent}33, ${f.accent}22)`,
                    border: `1px solid ${f.accent}66`,
                    clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                  }}
                >
                  {f.cta.label} <ArrowRight size={14} />
                </Link>
                <Link href={f.page.href}
                  className="flex items-center justify-center gap-2 w-full py-2 text-xs font-mono tracking-wider transition-colors"
                  style={{ color: f.accent, opacity: 0.7 }}
                >
                  {f.page.label} <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
