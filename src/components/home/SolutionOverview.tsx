import Link from 'next/link';
import { ArrowRight, Headphones, Search, LayoutDashboard } from 'lucide-react';

const pillars = [
  {
    icon: Headphones,
    label: 'HR Support',
    headline: 'Expert HR, when you need it.',
    body:
      'Access to experienced HR professionals for day-to-day queries, live employee situations, policy development, and compliance. No retainer. No guesswork.',
    cta: { label: 'See HR Services', href: '/services' },
    accent: 'var(--brand-purple)',
  },
  {
    icon: Search,
    label: 'Hiring Capability',
    headline: 'Structured hiring via specialist recruiters.',
    body:
      'Submit a role requirement and Ravello coordinates the search through our network of vetted, specialist recruitment partners. You see qualified candidates — not agency noise.',
    cta: { label: 'How hiring works', href: '/how-it-works' },
    accent: 'var(--brand-blue)',
  },
  {
    icon: LayoutDashboard,
    label: 'Client Portal',
    headline: 'One place for all of it.',
    body:
      'A dedicated workspace for your business. Track hiring pipelines, store HR documents, manage compliance deadlines, and raise support requests — all in one view.',
    cta: { label: 'See the portal', href: '/how-it-works#portal' },
    accent: 'var(--brand-teal)',
  },
];

export default function SolutionOverview() {
  return (
    <section className="section-padding section-dark">
      <div className="container-wide">

        {/* Header */}
        <div className="text-center mb-16 max-w-[640px] mx-auto">
          <p className="eyebrow-light mb-4">The Ravello system</p>
          <h2 className="display-lg text-white mb-5">
            Not a service. A system.
          </h2>
          <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Ravello is built as three connected capabilities — HR support, hiring, and operational visibility.
            Together they replace the patchwork of agencies, freelance HR, and spreadsheets that most SMEs
            are running on.
          </p>
        </div>

        {/* Pillars */}
        <div className="grid lg:grid-cols-3 gap-6 mb-12">
          {pillars.map((p, i) => (
            <div key={p.label} className="card-dark flex flex-col gap-5 p-7">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                  style={{
                    background: `color-mix(in srgb, ${p.accent} 18%, rgba(255,255,255,0.04))`,
                    border: `1px solid color-mix(in srgb, ${p.accent} 25%, rgba(255,255,255,0.08))`,
                  }}
                >
                  <p.icon size={17} style={{ color: p.accent }} />
                </div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: p.accent }}
                >
                  {p.label}
                </span>
              </div>

              <div>
                <h3 className="font-display font-bold text-[1.15rem] leading-snug text-white mb-3">
                  {p.headline}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {p.body}
                </p>
              </div>

              <div className="mt-auto pt-2">
                <Link
                  href={p.cta.href}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold transition-all hover:gap-2.5"
                  style={{ color: p.accent }}
                >
                  {p.cta.label} <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center">
          <Link href="/contact" className="btn-cta">
            See how Ravello works for your business <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
