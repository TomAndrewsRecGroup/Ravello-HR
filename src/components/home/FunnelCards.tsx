import Link from 'next/link';
import { ArrowRight, Users, Shield, Briefcase } from 'lucide-react';

const funnels = [
  {
    icon: Users,
    pill: 'Hiring',
    pillStyle: 'pill-purple',
    headline: 'Stop reopening roles.',
    body: 'Hiring that looks fine on paper keeps breaking down. The Smart Hiring System fixes the root cause — not just the symptoms.',
    pains: [
      'Roles filled, then vacant again in 6 months',
      'Agency bills that keep returning',
      'Candidates dropping off at offer stage',
    ],
    cta: { label: 'Get Your Hiring Score', href: '/tools/hiring-score' },
    link: { label: 'See the system', href: '/smart-hiring-system' },
    accent: 'var(--brand-purple)',
    accentBg: 'rgba(143,114,246,0.08)',
    accentBorder: 'rgba(143,114,246,0.2)',
    iconBg: 'rgba(143,114,246,0.12)',
    iconColor: '#8F72F6',
  },
  {
    icon: Shield,
    pill: 'Compliance',
    pillStyle: 'pill-blue',
    headline: 'Close the gaps before they cost you.',
    body: 'Most HR compliance issues are invisible until they\'re not. PolicySafe™ builds a clean, watertight foundation.',
    pains: [
      'Contracts that haven\'t been updated in years',
      'Managers applying different rules',
      'No structured disciplinary process',
    ],
    cta: { label: 'Run Policy Healthcheck', href: '/tools/policy-healthcheck' },
    link: { label: 'See PolicySafe™', href: '/policysafe' },
    accent: 'var(--brand-blue)',
    accentBg: 'rgba(147,184,255,0.08)',
    accentBorder: 'rgba(147,184,255,0.25)',
    iconBg: 'rgba(147,184,255,0.12)',
    iconColor: '#3B72CC',
  },
  {
    icon: Briefcase,
    pill: 'M&A & Change',
    pillStyle: 'pill-navy',
    headline: 'Deals fail on people.',
    body: 'The numbers look right. The people risk doesn\'t show up until after you\'ve signed. DealReady People™ changes that.',
    pains: [
      'Hidden liabilities only visible post-close',
      'TUPE mismanaged — tribunal exposure',
      'Key talent leaving before integration',
    ],
    cta: { label: 'Get DD Checklist', href: '/tools/due-diligence-checklist' },
    link: { label: 'See DealReady People™', href: '/dealready-people' },
    accent: 'var(--brand-navy)',
    accentBg: 'rgba(14,22,51,0.04)',
    accentBorder: 'rgba(14,22,51,0.15)',
    iconBg: 'rgba(14,22,51,0.07)',
    iconColor: 'var(--brand-navy)',
  },
];

export default function FunnelCards() {
  return (
    <section className="section-padding" style={{ background: 'var(--bg)' }}>
      <div className="container-wide">

        {/* Section header */}
        <div className="max-w-[560px] mb-16">
          <p className="eyebrow mb-4">Three systems. One firm.</p>
          <h2
            className="font-display font-bold mb-5"
            style={{ fontSize: 'clamp(1.9rem, 3.5vw, 2.75rem)', color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Which problem are you solving?
          </h2>
          <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Each system is purpose-built for a distinct people challenge. Pick yours and we'll show you exactly where to start.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {funnels.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.headline}
                className="relative flex flex-col rounded-[20px] p-8 transition-all duration-300 bg-white group"
                style={{
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 1px 4px rgba(14,22,51,0.05), 0 8px 32px rgba(14,22,51,0.06)',
                }}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(14,22,51,0.08), 0 20px 60px rgba(14,22,51,0.1)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                  (e.currentTarget as HTMLElement).style.borderColor = f.accentBorder;
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(14,22,51,0.05), 0 8px 32px rgba(14,22,51,0.06)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-line)';
                }}
              >
                {/* Top accent bar */}
                <div
                  className="absolute top-0 left-8 right-8 h-0.5 rounded-b-full"
                  style={{ background: f.accent }}
                />

                {/* Icon badge */}
                <div
                  className="w-11 h-11 rounded-[12px] flex items-center justify-center mb-6 flex-shrink-0"
                  style={{ background: f.iconBg }}
                >
                  <Icon size={20} style={{ color: f.iconColor }} />
                </div>

                <span className={f.pillStyle + ' mb-4 self-start'}>{f.pill}</span>

                <h3
                  className="font-display font-bold text-[1.3rem] mb-3 leading-snug"
                  style={{ color: 'var(--ink)' }}
                >
                  {f.headline}
                </h3>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
                  {f.body}
                </p>

                {/* Pain points */}
                <ul className="space-y-2.5 mb-8 flex-1">
                  {f.pains.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-xs" style={{ color: 'var(--ink-faint)' }}>
                      <span
                        className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: f.accent }}
                      />
                      {p}
                    </li>
                  ))}
                </ul>

                {/* CTAs */}
                <div className="mt-auto space-y-2.5">
                  <Link
                    href={f.cta.href}
                    className="btn-gradient w-full justify-center text-sm"
                  >
                    {f.cta.label} <ArrowRight size={14} />
                  </Link>
                  <Link
                    href={f.link.href}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-[8px] transition-colors"
                    style={{ color: 'var(--ink-soft)' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                    onMouseOut={(e)  => (e.currentTarget.style.color = 'var(--ink-soft)')}
                  >
                    {f.link.label} <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
