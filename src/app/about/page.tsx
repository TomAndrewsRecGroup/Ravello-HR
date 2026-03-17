import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Ravello was built to give growing businesses the HR infrastructure and hiring capability they need — without building it in-house.',
};

const principles = [
  {
    headline: 'Built for the gap',
    body: 'Most HR services are designed for enterprise. Most DIY HR is too risky for a business of 50 people. Ravello is built specifically for the businesses caught in between — those who have outgrown doing it alone, but don\'t yet need (or can\'t justify) a full-time HR team.',
  },
  {
    headline: 'Systems over advice',
    body: 'A call with an HR consultant gives you a recommendation. Ravello gives you a running system — ongoing support, structured hiring coordination, documented processes, and a portal to manage it all. The difference is continuity.',
  },
  {
    headline: 'No hidden complexity',
    body: 'We don\'t believe in retainer structures designed to maximise billing or agency fees that incentivise volume over quality. Ravello is clear about what it covers, what it costs, and what you get. If something isn\'t a fit, we\'ll tell you.',
  },
  {
    headline: 'Partner network, not one-size approach',
    body: 'For hiring, we work with a network of specialist recruiters rather than a single generalist approach. That means the right expertise for your specific role — whether that\'s a finance director, an operations lead, or a senior engineer.',
  },
];

export default function AboutPage() {
  return (
    <main className="pt-[70px]">

      {/* Hero */}
      <section className="section-padding section-light">
        <div className="container-mid text-center">
          <p className="eyebrow mb-4">About Ravello</p>
          <h1 className="display-xl mb-6" style={{ color: 'var(--ink)' }}>
            HR infrastructure for businesses<br className="hidden sm:block" /> that have outgrown winging it.
          </h1>
          <p className="text-lg leading-relaxed max-w-[560px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Ravello was built to solve a specific problem: growing businesses — typically 10 to 250
            people — need real HR and hiring capability, but the in-house model doesn&apos;t make sense yet.
          </p>
        </div>
      </section>

      {/* The problem we were built to solve */}
      <section className="section-padding section-dark">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="eyebrow-light mb-4">Why Ravello exists</p>
              <h2 className="display-lg text-white mb-6">
                The businesses that need HR the most are the ones left to figure it out alone.
              </h2>
              <div className="space-y-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <p className="text-base leading-relaxed">
                  Enterprise businesses have HR directors. Startups have lawyers on speed dial. But the
                  business scaling from 20 to 80 people — making its first senior hires, dealing with its
                  first serious employee issue, trying to build a people function without a budget for
                  one — often has no structured support at all.
                </p>
                <p className="text-base leading-relaxed">
                  They run on reactive decisions, ad hoc contracts, and whoever in the business happens
                  to have handled HR before. That works, until it doesn&apos;t.
                </p>
                <p className="text-base leading-relaxed">
                  Ravello was built to give those businesses what they actually need: expert support
                  when situations arise, a structured hiring process that doesn&apos;t rely on a single
                  agency relationship, and a portal that gives the leadership team visibility across it all.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { val: '10–250', label: 'People — the Ravello sweet spot' },
                { val: '3',      label: 'Core capabilities — HR, hiring, portal' },
                { val: '1',      label: 'Point of contact for your business' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="card-dark p-7"
                >
                  <p className="font-display font-bold text-[3rem] text-white leading-none mb-2">
                    {s.val}
                  </p>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="section-padding section-alt">
        <div className="container-wide">
          <div className="mb-14">
            <p className="eyebrow mb-3">How we operate</p>
            <h2 className="display-lg" style={{ color: 'var(--ink)' }}>
              The principles behind Ravello.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {principles.map((p) => (
              <div key={p.headline} className="card-feature">
                <h3 className="font-display font-bold text-[1.1rem]" style={{ color: 'var(--ink)' }}>
                  {p.headline}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding section-light">
        <div className="container-narrow text-center">
          <h2 className="display-md mb-5" style={{ color: 'var(--ink)' }}>
            Want to see how Ravello works<br className="hidden sm:block" /> for your business?
          </h2>
          <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
            Book a free 30-minute consultation. No pitch, no obligation — just a clear picture of
            what Ravello covers for your size and situation.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="btn-cta">
              Book a consultation <ArrowRight size={15} />
            </Link>
            <Link href="/how-it-works" className="btn-secondary">
              How it works
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
