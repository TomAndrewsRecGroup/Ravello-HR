import { Metadata } from 'next';
import Image from 'next/image';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PROTECT Services | HR Foundations and Compliance | The People System',
  description: 'Five PROTECT packages: Essentials, Core, Partner, Enterprise, Transaction. Contracts, handbooks, compliance, Employment Rights Bill readiness: The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/protect' },
};

const packages = [
  {
    name: 'Protect Essentials',
    tag: 'Starting point',
    price: 'From £495 · one-off',
    highlight: false,
    who: 'For businesses under 10 people that need the absolute basics in place: written contracts, a holiday and absence policy, and a basic disciplinary procedure. Fast, clean, done properly.',
    includes: [
      'Employment contract template (suited to your business)',
      'Offer letter template',
      'Basic disciplinary and grievance procedure',
      'Holiday and absence policy',
      '1-hour implementation call',
    ],
    cta: { label: 'Get Started', href: '/book' },
  },
  {
    name: 'Protect Core',
    tag: 'Most popular · 10-50 people',
    price: 'From £1,200 one-off · optional retainer £500-£750/month',
    highlight: true,
    who: 'For growing businesses that have outgrown the basics. You need a handbook that covers how your business actually works, a proper policy library, and managers who know how to apply the rules consistently.',
    includes: [
      'Full employment contract suite (permanent, fixed-term, part-time)',
      'Bespoke staff handbook (written around your business)',
      'Core policy library: 12 policies including remote working, AI use, mental health',
      'Manager guide and FAQ document',
      'Gap analysis of existing documentation',
      '2 review and sign-off sessions',
      'Employment Rights Bill compliance check included',
      'Optional: add an ongoing update retainer at £500-£750/month',
    ],
    cta: { label: 'Get a Free HR Audit', href: '/book' },
  },
  {
    name: 'Protect Partner',
    tag: 'Ongoing · 50+ people',
    price: '£1,500-£2,500/month',
    highlight: false,
    who: 'For businesses that need ongoing HR documentation support: new policies as the business evolves, regular compliance reviews, manager guidance on live situations, and Employment Rights Bill readiness built in.',
    includes: [
      'Everything in Protect Core',
      'Full bespoke policy library (ongoing)',
      'Employment Rights Bill implementation support',
      'Monthly compliance review call',
      'Manager guidance on live HR situations (documentation focus)',
      'Priority turnaround on new policies and contract variations',
    ],
    cta: { label: 'Book a Call', href: '/book' },
  },
  {
    name: 'Protect Enterprise',
    tag: 'Complex · bespoke scope',
    price: '£3,000-£5,000+/month',
    highlight: false,
    who: 'For businesses with multi-site, multi-contract, or multi-country complexity. Where the policy library is large, the manager population is significant, and consistency across the business requires ongoing active management.',
    includes: [
      'Full policy library design and management',
      'Multi-site or multi-contract harmonisation',
      'Regular legal compliance monitoring',
      'HR documentation governance framework',
      'Quarterly board-level people risk summary',
      'Direct access to us throughout',
    ],
    cta: { label: 'Book a Call', href: '/book' },
  },
  {
    name: 'Protect Transaction',
    tag: 'Project · M&A and TUPE',
    price: 'From £3,500 · one-off project',
    highlight: false,
    who: 'For businesses going through an acquisition, merger, or TUPE transfer. People documentation and compliance risk needs specific, transaction-aware review. This is a scoped project: not a retainer.',
    includes: [
      'Contract and documentation review against transaction terms',
      'TUPE compliance check and letter suite',
      'Redundancy documentation (if required)',
      'Contract harmonisation post-transfer',
      'People risk summary written for board and legal team use',
    ],
    cta: { label: 'Book a Call about your deal', href: '/book' },
  },
];

export default function ProtectPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem 2.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-14 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-blue)', verticalAlign: 'middle' }} />
                PROTECT: Services and Pricing
              </p>
              <h1 className="font-display mb-5">
                Five ways to work with us<br />
                <span className="text-gradient">on your HR foundations.</span>
              </h1>
              <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                Documented. Protected. Ready to scale. Every PROTECT engagement is built around what your business genuinely needs: not a copy-paste from a template library. Written by us. Compliant with current UK law, including Employment Rights Bill changes.
              </p>
              <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
                Not sure where to start? A free HR audit takes thirty minutes and gives you a clear, prioritised picture of your compliance exposure and what to fix first.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">
                  Get a Free HR Audit <ArrowRight size={16} />
                </Link>
                <Link href="/policysafe" className="btn-secondary">
                  How PROTECT works
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image src="https://images.unsplash.com/photo-1556761175-b413da4baf72?w=960&h=960&fit=crop&crop=faces" alt="Team reviewing compliance documents" fill className="object-cover" sizes="420px" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Employment Rights Bill callout */}
      <section style={{ padding: '2.5rem 1.5rem' }} className="lg:px-10">
        <div className="container-narrow">
          <div className="rounded-[18px] p-8 flex flex-col sm:flex-row gap-5 items-start" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.18)' }}>
            <AlertTriangle size={26} className="flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
            <div>
              <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--ink)' }}>Employment Rights Bill: compliance pressure is building now</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                The Employment Rights Bill introduces significant changes for UK employers: expanded day-one rights, reformed zero-hours protections, and tighter dismissal requirements. Many SMEs are not ready. Every Protect Core engagement and above includes an Employment Rights Bill compliance check as standard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="font-display section-title mb-4">PROTECT <span className="text-gradient">packages</span></h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              From a fast one-off essentials fix to fully managed ongoing compliance. All written by us, not by a template generator.
            </p>
          </div>
          <div className="space-y-6">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className="rounded-[22px] p-8"
                style={pkg.highlight
                  ? { background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', color: '#fff', boxShadow: '0 8px 40px rgba(123,47,190,0.25)' }
                  : { background: 'var(--surface)', border: '1px solid var(--brand-line)' }
                }
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-8">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <h3
                        className="font-bold text-2xl"
                        style={{ color: pkg.highlight ? '#fff' : 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, letterSpacing: '-0.02em' }}
                      >
                        {pkg.name}
                      </h3>
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={pkg.highlight
                          ? { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }
                          : { background: 'var(--bg)', color: 'var(--ink-soft)', border: '1px solid var(--brand-line)' }
                        }
                      >
                        {pkg.tag}
                      </span>
                    </div>
                    <p
                      className="font-bold text-lg mb-4"
                      style={{ color: pkg.highlight ? 'rgba(255,255,255,0.9)' : 'var(--brand-purple)' }}
                    >
                      {pkg.price}
                    </p>
                    <p
                      className="text-sm leading-relaxed mb-6"
                      style={{ color: pkg.highlight ? 'rgba(255,255,255,0.8)' : 'var(--ink-soft)' }}
                    >
                      {pkg.who}
                    </p>
                    <ul className="space-y-2">
                      {pkg.includes.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <CheckCircle
                            className="flex-shrink-0 mt-0.5"
                            size={15}
                            style={{ color: pkg.highlight ? 'rgba(255,255,255,0.7)' : 'var(--brand-purple)' }}
                          />
                          <span
                            className="text-sm"
                            style={{ color: pkg.highlight ? 'rgba(255,255,255,0.8)' : 'var(--ink-soft)' }}
                          >
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="lg:w-48 flex-shrink-0">
                    <Link
                      href={pkg.cta.href}
                      className={pkg.highlight ? 'btn-outline-white w-full justify-center' : 'btn-gradient w-full justify-center'}
                    >
                      {pkg.cta.label} <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audit CTA */}
      <section style={{ background: 'var(--surface-alt)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-14 items-center">
            <div>
              <h2 className="font-display section-title mb-4">Start with <span className="text-gradient">a free HR audit</span></h2>
              <p className="text-lg mb-8 max-w-xl" style={{ color: 'var(--ink-soft)' }}>
                Thirty minutes with us. You will leave with a clear, prioritised view of your compliance exposure, what is missing, and which PROTECT package is the right starting point.
              </p>
              <Link href="/book" className="btn-gradient">
                Book a Free HR Audit <ArrowRight size={16} />
              </Link>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=960&h=960&fit=crop&crop=faces" alt="Business professionals discussing strategy" fill className="object-cover" sizes="420px" />
                <div className="absolute inset-x-0 bottom-0 p-6" style={{ background: 'linear-gradient(to top, rgba(5,8,16,0.88) 0%, rgba(5,8,16,0.45) 60%, transparent 100%)' }}>
                  <p className="text-white text-sm leading-relaxed mb-2" style={{ fontStyle: 'italic', opacity: 0.95 }}>&ldquo;Not HR from a textbook. People results from operators who have done the real work.&rdquo;</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Lucy &amp; Tom, The People System</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
        { q: 'How are PROTECT packages priced?', a: 'Protect Essentials is from £495 as a one-off project. Protect Core is from £1,200 one-off with an optional ongoing retainer at £500-£750/month. Protect Partner runs at £1,500-£2,500/month. Protect Enterprise is bespoke, typically £3,000-£5,000+/month. Protect Transaction starts from £3,500 as a scoped project.' },
        { q: 'Does the Employment Rights Bill affect us?', a: 'Almost certainly yes, if you employ people in the UK. The Bill extends day-one rights, reforms zero-hours protections, and tightens the rules around dismissal and redundancy. The changes are staggered through 2025 and 2026. We review every Protect Core engagement and above against current and upcoming legislation.' },
        { q: 'How long does a PROTECT engagement take?', a: 'Protect Essentials typically completes within one week. Protect Core takes two to four weeks depending on the state of your existing documentation. Protect Transaction is scoped per deal: typically two to four weeks from kickoff.' },
        { q: 'We already have a basic handbook. Do we need this?', a: 'If it was written more than two years ago, probably yes. Employment law changes, working practices change, and gaps that seemed minor become claims. We will do a gap analysis as part of Protect Core before any rewriting begins.' },
        { q: 'Is this legal advice?', a: 'PROTECT covers HR documentation and employment compliance: contracts, handbooks, policies, and procedures. For active litigation or complex legal disputes, we work alongside your employment solicitor rather than replacing them.' },
      ]} />

    </div>
  );
}
