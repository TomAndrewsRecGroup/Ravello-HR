import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'HR support, structured hiring, and client portal access for growing businesses. Ravello replaces the patchwork of freelance HR, agencies, and spreadsheets.',
};

const hrOutcomes = [
  'Day-to-day HR queries answered by a named expert',
  'Employee relations support — disciplinaries, grievances, performance',
  'Policy development and documentation',
  'Compliance guidance and deadline management',
  'Onboarding and offboarding frameworks',
  'Employment contracts and offer letter templates',
  'Manager coaching for HR situations',
];

const hiringOutcomes = [
  'Submit a role requirement in minutes via your portal',
  'Sourcing coordinated through vetted specialist recruiters',
  'Candidates screened before they reach you',
  'Pipeline tracked end-to-end in your portal',
  'Offer and onboarding support included',
  'No agency selection, fee negotiation, or inbox management',
];

const portalOutcomes = [
  'Single dashboard for HR activity and hiring',
  'Document storage, version control, and categorisation',
  'Compliance alerts before deadlines pass',
  'HR reports generated and accessible in-portal',
  'Support ticket submission and tracking',
  'Role-based access for your leadership team',
];

function ServiceBlock({
  eyebrow,
  headline,
  body,
  outcomes,
  cta,
  ctaHref,
  secondaryCta,
  secondaryCtaHref,
  dark = false,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  outcomes: string[];
  cta: string;
  ctaHref: string;
  secondaryCta?: string;
  secondaryCtaHref?: string;
  dark?: boolean;
}) {
  return (
    <section className={`section-padding ${dark ? 'section-dark' : 'section-alt'}`}>
      <div className="container-wide">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className={`mb-4 ${dark ? 'eyebrow-light' : 'eyebrow'}`}>{eyebrow}</p>
            <h2
              className={`display-lg mb-6 ${dark ? 'text-white' : ''}`}
              style={{ color: dark ? undefined : 'var(--ink)' }}
            >
              {headline}
            </h2>
            <p
              className="text-base leading-relaxed mb-8"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--ink-soft)' }}
            >
              {body}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={ctaHref} className="btn-cta">
                {cta} <ArrowRight size={15} />
              </Link>
              {secondaryCta && secondaryCtaHref && (
                <Link href={secondaryCtaHref} className={dark ? 'btn-outline-light' : 'btn-secondary'}>
                  {secondaryCta}
                </Link>
              )}
            </div>
          </div>

          <div>
            <div
              className="rounded-[20px] p-7"
              style={{
                background: dark ? 'rgba(255,255,255,0.04)' : 'var(--surface)',
                border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--brand-line)',
              }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.16em] mb-5"
                style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'var(--ink-faint)' }}
              >
                What this covers
              </p>
              <ul className="space-y-3">
                {outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2
                      size={15}
                      className="flex-shrink-0 mt-0.5"
                      style={{ color: 'var(--brand-purple)' }}
                    />
                    <span style={{ color: dark ? 'rgba(255,255,255,0.65)' : 'var(--ink-soft)' }}>
                      {o}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ServicesPage() {
  return (
    <main className="pt-[70px]">

      {/* Hero */}
      <section className="section-padding section-light">
        <div className="container-mid text-center">
          <p className="eyebrow mb-4">What Ravello delivers</p>
          <h1 className="display-xl mb-6" style={{ color: 'var(--ink)' }}>
            Outcomes, not features.
          </h1>
          <p className="text-lg leading-relaxed max-w-[520px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Ravello isn&apos;t a list of services. It&apos;s three capabilities working together to remove the
            people problems that slow growing businesses down.
          </p>
        </div>
      </section>

      {/* HR Support */}
      <ServiceBlock
        eyebrow="HR Support"
        headline="Expert HR without the full-time cost."
        body="Access experienced HR professionals for day-to-day queries, live employee situations, compliance guidance, and policy development. No retainer contracts. No generic advice. A named expert who knows your business."
        outcomes={hrOutcomes}
        cta="Talk to Ravello"
        ctaHref="/contact"
        secondaryCta="How it works"
        secondaryCtaHref="/how-it-works"
      />

      {/* Hiring */}
      <ServiceBlock
        eyebrow="Hiring Capability"
        headline="Structured hiring via specialist recruiters."
        body="Submit a role requirement and Ravello coordinates sourcing through our network of vetted recruitment partners. You see qualified candidates, not agency noise. The pipeline is visible in your portal throughout."
        outcomes={hiringOutcomes}
        cta="Submit a Role"
        ctaHref="/contact#submit-role"
        secondaryCta="See the hiring flow"
        secondaryCtaHref="/how-it-works#hiring"
        dark
      />

      {/* Portal */}
      <ServiceBlock
        eyebrow="Client Portal"
        headline="One workspace for all of it."
        body="Every Ravello client gets a private portal — a single place to track hiring activity, store documents, manage compliance deadlines, and raise support requests. No more email threads, shared drives, or spreadsheet trackers."
        outcomes={portalOutcomes}
        cta="See the portal"
        ctaHref="/how-it-works#portal"
        secondaryCta="Request access"
        secondaryCtaHref="/contact"
      />

      {/* Final CTA */}
      <section className="section-padding section-dark">
        <div className="container-narrow text-center">
          <h2 className="display-md text-white mb-5">
            Not sure where to start?
          </h2>
          <p className="text-base leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Book a free 30-minute consultation. We&apos;ll look at your current setup and tell you
            exactly what Ravello covers for your business.
          </p>
          <Link href="/contact" className="btn-cta">
            Book a Free Consultation <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </main>
  );
}
