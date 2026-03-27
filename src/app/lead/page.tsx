import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'LEAD Services | Fractional People Leadership | The People System',
  description: 'Four LEAD packages: Lead Foundations, Lead Optimiser, Lead Partner, Lead Build. Fractional HR leadership and manager enablement — The People System.',
  alternates: { canonical: 'https://ravellohr.co.uk/lead' },
};

const packages = [
  {
    name: 'Lead Foundations',
    tag: 'Starting point · ongoing',
    price: '£1,000/month',
    highlight: false,
    who: 'For businesses that need a senior HR voice available on a regular basis — someone to call when a people question comes up, to sanity-check decisions, and to prevent small issues from becoming expensive ones. Not a full fractional engagement. A reliable floor.',
    includes: [
      'Monthly strategic HR check-in (60 min)',
      'Ad-hoc advice on people decisions and live situations',
      'Manager guidance on individual cases',
      'Access to Lucy via email between sessions',
      'Escalation to higher packages where a situation requires it',
    ],
    cta: { label: 'Talk to Lucy', href: '/book' },
  },
  {
    name: 'Lead Optimiser',
    tag: 'Project · fix a specific problem',
    price: '£2,500 one-off, or £1,500/month × 3',
    highlight: false,
    who: 'For businesses with a specific people challenge that needs fixing properly. A manager who is struggling. A performance process that is not working. A team structure that needs redesigning. A culture issue that has been ignored too long. Fixed scope, clear deliverable.',
    includes: [
      'Problem diagnosis and root cause analysis',
      'Manager coaching (up to 3 sessions)',
      'Process or framework design (one area)',
      'Written recommendations and implementation guide',
      'One follow-up review session',
    ],
    cta: { label: 'Book a Scoping Call', href: '/book' },
  },
  {
    name: 'Lead Partner',
    tag: 'Most popular · embedded fractional HR',
    price: '£3,000–£4,500/month',
    highlight: true,
    who: 'For businesses that need a proper people function without the cost of a full-time CPO or HRD. Lucy acts as your fractional People lead — attending leadership team meetings, owning the people agenda, running manager capability work, and building the infrastructure your business needs to scale.',
    includes: [
      'Weekly leadership team attendance (where relevant)',
      'People strategy development and quarterly roadmap',
      'Manager enablement programme — structured, not one-off',
      'Performance framework design and implementation',
      'Engagement and retention planning',
      'Succession and talent planning (where relevant)',
      'Escalation point for all senior HR matters',
      'Direct line to Lucy throughout',
    ],
    cta: { label: 'Book a Scoping Call', href: '/book' },
  },
  {
    name: 'Lead Build',
    tag: 'Scale · building your people function',
    price: '£5,000–£7,500+/month',
    highlight: false,
    who: 'For businesses scaling rapidly that need a people function built from scratch or completely rebuilt. Lucy designs the structure, hires into it, builds the processes, and hands over a fully operational people function. This is not a retainer — it is a transformation engagement.',
    includes: [
      'Full people function design and build',
      'HRIS selection and implementation support',
      'HR hire scoping and interview support',
      'Manager capability programme (full cohort)',
      'Culture and values framework',
      'People strategy aligned to 12–24 month business plan',
      'Board-level people reporting framework',
      'Transition plan to in-house team',
    ],
    cta: { label: 'Talk to Lucy', href: '/book' },
  },
];

export default function LeadPage() {
  return (
    <div className="pt-20">

      {/* Hero */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-narrow">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            LEAD — Services and Pricing
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
              fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
              fontWeight: 300,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              marginBottom: '1.25rem',
            }}
          >
            Four ways to work with Lucy<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              on your people leadership.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Most growing businesses reach a point where the founder is making too many people decisions, managers are not equipped to lead properly, and the business is scaling without the infrastructure to support it. That is where LEAD starts.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            From a reliable floor of strategic HR advice through to a full fractional CPO engagement — the right model depends on where the biggest gap is sitting. Not sure? A scoping call takes thirty minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Book a Scoping Call <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* What LEAD covers */}
      <section className="section-sm" style={{ background: 'var(--surface)' }}>
        <div className="container-narrow">
          <div className="rounded-[18px] p-8" style={{ background: 'var(--bg)', border: '1px solid var(--brand-line)' }}>
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, fontSize: '1.4rem' }}>
              What LEAD covers
            </h2>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
              {[
                'Fractional People leadership (CPO / HRD level)',
                'People strategy and quarterly roadmap',
                'Manager enablement and coaching',
                'Performance and development frameworks',
                'Culture and engagement programmes',
                'Succession and talent planning',
                'HRIS selection and implementation',
                'Building and transitioning to an in-house team',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 py-1">
                  <CheckCircle className="flex-shrink-0 mt-0.5" size={14} style={{ color: 'var(--brand-purple)' }} />
                  <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="section-title mb-4">LEAD packages</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              From a reliable HR floor to a full people function build. No tables — here is what each engagement actually looks like.
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

      {/* CTA */}
      <section className="section-sm" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title mb-4">Not sure where the biggest gap is?</h2>
          <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Book thirty minutes with Lucy. Bring your current people challenge and leave with a clear view of what needs fixing and which engagement makes sense.
          </p>
          <Link href="/book" className="btn-gradient">
            Book a Free Scoping Call <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
        { q: 'What is fractional People leadership?', a: 'Lucy acts as your CPO or HRD on a part-time basis — typically one to three days per week depending on the package. You get senior-level people leadership without the cost of a full-time executive hire.' },
        { q: 'What is the difference between LEAD and PROTECT?', a: 'PROTECT builds the foundations: contracts, handbook, policies, compliance. LEAD is about leadership: strategy, culture, manager capability, people function design. Many clients need both. They can run in parallel or sequence depending on priority.' },
        { q: 'Do we need to have a people function already?', a: 'No. Lead Build is specifically designed for businesses building their people function from scratch. Lead Foundations and Lead Optimiser work well for businesses that have no formal HR function at all.' },
        { q: 'How involved is Lucy on a day-to-day basis?', a: 'It depends on the package. Lead Foundations is one structured session per month plus ad-hoc access. Lead Partner typically involves weekly involvement including leadership team meetings. Lead Build is more intensive, particularly in the early months.' },
        { q: 'Can we combine LEAD with HIRE or PROTECT?', a: 'Yes, and many clients do. Tom and Lucy work together on accounts that span multiple pillars. The People System is set up specifically for this — a joined-up people function across hiring, leadership, and compliance, run by people who actually talk to each other.' },
      ]} />

    </div>
  );
}
