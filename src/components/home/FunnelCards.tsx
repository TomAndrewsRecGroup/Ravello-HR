'use client';
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
    cta:  { label: 'Get Your Hiring Score',  href: '/tools/hiring-score' },
    link: { label: 'See the system',          href: '/smart-hiring-system' },
    accent:       'var(--brand-purple)',
    accentBorder: 'rgba(124,58,237,0.22)',
    iconBg:       'rgba(124,58,237,0.09)',
    iconColor:    '#7C3AED',
    barColor:     'var(--brand-purple)',
  },
  {
    icon: Shield,
    pill: 'Compliance',
    pillStyle: 'pill-blue',
    headline: 'Close the gaps before they cost you.',
    body: "Most HR compliance issues are invisible until they're not. PolicySafe™ builds a clean, watertight foundation.",
    pains: [
      "Contracts that haven't been updated in years",
      'Managers applying different rules',
      'No structured disciplinary process',
    ],
    cta:  { label: 'Run Policy Healthcheck', href: '/tools/policy-healthcheck' },
    link: { label: 'See PolicySafe™',        href: '/policysafe' },
    accent:       'var(--brand-blue)',
    accentBorder: 'rgba(59,111,255,0.22)',
    iconBg:       'rgba(59,111,255,0.09)',
    iconColor:    '#3B6FFF',
    barColor:     'var(--brand-blue)',
  },
  {
    icon: Briefcase,
    pill: 'M&A & Change',
    pillStyle: 'pill-navy',
    headline: 'Deals fail on people.',
    body: "The numbers look right. The people risk doesn't show up until after you've signed. DealReady People™ changes that.",
    pains: [
      'Hidden liabilities only visible post-close',
      'TUPE mismanaged — tribunal exposure',
      'Key talent leaving before integration',
    ],
    cta:  { label: 'Get DD Checklist',        href: '/tools/due-diligence-checklist' },
    link: { label: 'See DealReady People™',   href: '/dealready-people' },
    accent:       'var(--brand-navy)',
    accentBorder: 'rgba(7,11,32,0.18)',
    iconBg:       'rgba(7,11,32,0.07)',
    iconColor:    'var(--brand-navy)',
    barColor:     'var(--brand-navy)',
  },
];

export default function FunnelCards() {
  return (
    <section className="section-padding" style={{ background: 'var(--bg)' }}>
      <div className="container-wide">

        {/* Section header */}
        <div className="max-w-[600px] mb-16">
          <p className="eyebrow mb-5">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block mr-2"
              style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
            />
            Three systems. One firm.
          </p>
          <h2 className="section-title mb-5">Which problem are you solving?</h2>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Each system is purpose-built for a distinct people challenge.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {funnels.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.headline}
                className="relative flex flex-col rounded-[22px] p-8 bg-white transition-all duration-300 group"
                style={{
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 2px 6px rgba(7,11,29,0.04), 0 8px 32px rgba(7,11,29,0.05)',
                }}
                onMouseOver={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = '0 8px 24px rgba(7,11,29,0.08), 0 28px 64px rgba(7,11,29,0.09)';
                  el.style.transform = 'translateY(-5px)';
                  el.style.borderColor = f.accentBorder;
                }}
                onMouseOut={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = '0 2px 6px rgba(7,11,29,0.04), 0 8px 32px rgba(7,11,29,0.05)';
                  el.style.transform = 'translateY(0)';
                  el.style.borderColor = 'var(--brand-line)';
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
                  className="font-bold text-[1.25rem] mb-3 leading-snug"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.015em', fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif' }}
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
