import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const funnels = [
  {
    pill: 'Hiring',
    pillStyle: 'pill-purple',
    headline: 'Stop reopening roles.',
    body: 'Hiring that looks fine on paper keeps breaking down. The Smart Hiring System fixes the root cause — not just the symptoms.',
    pains: ['Roles filled, then vacant again in 6 months', 'Agency bills that keep returning', 'Candidates dropping off at offer stage'],
    cta: { label: 'Get Your Hiring Score', href: '/tools/hiring-score' },
    link: { label: 'See the system', href: '/smart-hiring-system' },
    accent: 'var(--brand-purple)',
  },
  {
    pill: 'Compliance',
    pillStyle: 'pill-blue',
    headline: 'Close the gaps before they cost you.',
    body: 'Most HR compliance issues are invisible until they’re not. PolicySafe™ builds a clean, watertight foundation.',
    pains: ['Contracts that haven’t been updated in years', 'Managers applying different rules', 'No structured disciplinary process'],
    cta: { label: 'Run Policy Healthcheck', href: '/tools/policy-healthcheck' },
    link: { label: 'See PolicySafe™', href: '/policysafe' },
    accent: 'var(--brand-blue)',
  },
  {
    pill: 'M&A & Change',
    pillStyle: 'pill-navy',
    headline: 'Deals fail on people.',
    body: 'The numbers look right. The people risk doesn’t show up until after you’ve signed. DealReady People™ changes that.',
    pains: ['Hidden liabilities only visible post-close', 'TUPE mismanaged — tribunal exposure', 'Key talent leaving before integration'],
    cta: { label: 'Get DD Checklist', href: '/tools/due-diligence-checklist' },
    link: { label: 'See DealReady People™', href: '/dealready-people' },
    accent: 'var(--brand-navy)',
  },
];

export default function FunnelCards() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
      <div className="container-wide">

        <div className="mb-14">
          <p className="eyebrow mb-4">Three systems. One firm.</p>
          <h2 className="font-display font-bold" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.75rem)', color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Which problem are you solving?
          </h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {funnels.map((f) => (
            <div key={f.headline} className="card flex flex-col">

              <span className={f.pillStyle + ' mb-5 self-start'}>{f.pill}</span>

              <h3 className="font-display font-bold text-[1.35rem] mb-3 leading-snug" style={{ color: 'var(--ink)' }}>
                {f.headline}
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>{f.body}</p>

              <ul className="space-y-2 mb-8 flex-1">
                {f.pains.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: f.accent }} />
                    {p}
                  </li>
                ))}
              </ul>

              <div className="mt-auto space-y-2">
                <Link href={f.cta.href} className="btn-primary w-full justify-center text-sm">
                  {f.cta.label} <ArrowRight size={14} />
                </Link>
                <Link href={f.link.href}
                  className="flex items-center justify-center gap-1.5 text-xs font-medium py-2 transition-colors hover:opacity-80"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  {f.link.label} <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
