import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// Compact homepage teaser that replaced the full CostOfProblem section.
// The full breakdown lives at /cost-of-doing-nothing.
export default function CostTeaser() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface)' }}>
      <div className="container-wide">
        <div
          className="rounded-[24px] overflow-hidden grid lg:grid-cols-[1fr_auto] gap-10 items-center px-8 lg:px-12 py-10 lg:py-12"
          style={{
            background: 'linear-gradient(135deg, rgba(217,68,68,0.06), rgba(217,68,68,0.02))',
            border: '1px solid var(--brand-line)',
          }}
        >
          <div>
            <p className="eyebrow mb-4">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: '#D94444', verticalAlign: 'middle' }}
              />
              The cost of doing nothing
            </p>

            <h3
              className="font-display mb-4"
              style={{
                fontSize: 'clamp(1.6rem, 2.6vw, 2.4rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                color: 'var(--ink)',
              }}
            >
              Day-1 unfair dismissal rights. £132k bad-hire cost. £13.7k tribunal awards.
              <br />
              <span className="text-gradient">Every month you delay costs more than the fix.</span>
            </h3>

            <p className="text-base leading-relaxed max-w-[640px]" style={{ color: 'var(--ink-soft)' }}>
              Five 2026 numbers most UK founders don&apos;t know — with sources,
              what they cost over 12 months, and how we fix each one.
            </p>
          </div>

          <Link
            href="/cost-of-doing-nothing"
            className="btn-gradient self-start lg:self-center whitespace-nowrap"
          >
            See the numbers <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
