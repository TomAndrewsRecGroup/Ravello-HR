'use client';
import Link from 'next/link';
import { ArrowRight, Users, Shield, Briefcase } from 'lucide-react';

const funnels = [
  {
    icon: Users,
    pill: 'HIRE',
    pillStyle: 'pill-purple',
    headline: 'Your hiring is broken. We fix it before it costs you.',
    body: 'Agency fees on repeat. Bad hires. Roles that never stay filled. We fix the root cause. Before a role goes live, we score it against live market data so you know exactly where it will struggle.',
    pains: [
      'Roles filled, then vacant again in 6 months',
      'Agency bills with nothing to show for them',
      'Candidates dropping off before offer stage',
    ],
    cta:  { label: 'Start with a Hiring Audit', href: '/smart-hiring-system' },
    link: { label: 'See the HIRE packages',     href: '/smart-hiring-system' },
    accent:       'var(--brand-purple)',
    accentBorder: 'rgba(124,58,237,0.22)',
    iconBg:       'rgba(124,58,237,0.09)',
    iconColor:    '#7C3AED',
    barColor:     'var(--brand-purple)',
  },
  {
    icon: Briefcase,
    pill: 'LEAD',
    pillStyle: 'pill-navy',
    headline: 'No People lead? Get one without the headcount cost.',
    body: 'Fractional People leadership for businesses that need proper HR thinking at the top without hiring a full-time People Director. Strategy, manager enablement, and people decisions: handled.',
    pains: [
      'No senior HR thinking driving people decisions',
      'Managers left to figure it out on their own',
      'People strategy non-existent or stuck in a drawer',
    ],
    cta:  { label: 'Explore Lead',          href: '/book' },
    link: { label: 'See the LEAD packages', href: '/book' },
    accent:       'var(--brand-navy)',
    accentBorder: 'rgba(7,11,32,0.18)',
    iconBg:       'rgba(7,11,32,0.07)',
    iconColor:    'var(--brand-navy)',
    barColor:     'var(--brand-navy)',
  },
  {
    icon: Shield,
    pill: 'PROTECT',
    pillStyle: 'pill-blue',
    headline: 'Get your HR foundations right. Before something goes wrong.',
    body: 'Missing contracts, outdated handbooks, compliance gaps the Employment Rights Bill will expose. We build the foundations that protect your business: documented, watertight, ready to scale.',
    pains: [
      "Contracts that haven't been reviewed in years",
      'No handbook managers will actually follow',
      'Compliance exposure you cannot currently see',
    ],
    cta:  { label: 'Get a Free HR Audit',      href: '/policysafe' },
    link: { label: 'See the PROTECT packages', href: '/policysafe' },
    accent:       'var(--brand-blue)',
    accentBorder: 'rgba(59,111,255,0.22)',
    iconBg:       'rgba(59,111,255,0.09)',
    iconColor:    '#3B6FFF',
    barColor:     'var(--brand-blue)',
  },
];

export default function FunnelCards() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface)' }}>
      <div className="container-wide">

        {/* Section header */}
        <div className="max-w-[600px] mb-16">
          <p className="eyebrow mb-5">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block mr-2"
              style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
            />
            Three pillars. One partner.
          </p>
          <h2 className="section-title mb-5">Where do you need us most?</h2>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Start with the pillar that fits right now. Most clients build from there.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {funnels.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.headline}
                className="relative flex flex-col rounded-[22px] p-8 bg-white transition-all duration-300 group hover:-translate-y-[5px]"
                style={{
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 2px 6px rgba(7,11,29,0.04), 0 8px 32px rgba(7,11,29,0.05)',
                  ['--hover-shadow' as string]: '0 8px 24px rgba(7,11,29,0.08), 0 28px 64px rgba(7,11,29,0.09)',
                }}
              >
                {/* Top colour bar */}
                <div
                  className="absolute top-0 left-8 right-8 h-[2px] rounded-b-full"
                  style={{ background: f.accent }}
                />

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-[14px] flex items-center justify-center mb-6 mt-1"
                  style={{ background: f.iconBg }}
                >
                  <Icon size={22} style={{ color: f.iconColor }} />
                </div>

                <span className={`${f.pillStyle} mb-4 self-start`}>{f.pill}</span>

                <h3
                  className="font-light text-[1.7rem] mb-3 leading-[1.1]"
                  style={{
                    color: 'var(--ink)',
                    letterSpacing: '-0.025em',
                    fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                  }}
                >
                  {f.headline}
                </h3>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
                  {f.body}
                </p>

                <ul className="space-y-3 mb-8 flex-1">
                  {f.pains.map((p) => (
                    <li
                      key={p}
                      className="flex items-start gap-3 text-sm"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      <span
                        className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: f.accent }}
                      />
                      {p}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto space-y-2.5">
                  <Link href={f.cta.href} className="btn-gradient w-full text-sm">
                    {f.cta.label} <ArrowRight size={14} />
                  </Link>
                  <Link
                    href={f.link.href}
                    className="flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-[10px] transition-colors hover:bg-[var(--surface-soft)]"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    {f.link.label} <ArrowRight size={12} />
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
