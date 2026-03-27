import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Building2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About | Lucy and Tom | The People System',
  description: 'Not HR with a bit of recruitment. Not recruitment pretending to do HR. The People System is Lucy and Tom — 18+ years HR leadership and 10+ years talent expertise, working together.',
  alternates: { canonical: 'https://ravellohr.co.uk/about' },
};

const lucyCredentials = [
  '18+ years senior HR and People leadership',
  'Managed HR through acquisitions, restructures, and rapid scale-ups',
  'Built hiring frameworks that reduced agency spend by 40–60% in 12 months',
  'Designed HR infrastructure adopted across multi-site, multi-country operations',
  'Advised leadership teams on change affecting hundreds of employees',
  'Zero tribunal outcomes across every disciplinary, redundancy, and TUPE process',
];

const tomCredentials = [
  '10+ years in talent and recruitment leadership',
  'Founder — Andrews Recruitment Group',
  'Founder — RecXchange (15,000+ recruiter network) and RecX Direct',
  'Founder — IvyLens Technology (role scoring platform and automated outreach tools)',
  'Founder — AMIVY Designs (lead generation, sales and marketing)',
  'Embedded talent delivery across founder-led and PE-backed businesses',
  'Reduced agency dependency and time-to-hire on every long-term engagement',
];

const sectorExperience = [
  { label: 'Retail and Consumer',         desc: 'Multi-site HR transformation, manager capability programme, hiring system redesign' },
  { label: 'Professional Services',        desc: 'Hiring process rebuild, agency dependency reduced, time-to-hire cut by 8 weeks' },
  { label: 'PE-backed SME',                desc: 'Pre-acquisition people DD, post-deal integration, contract harmonisation' },
  { label: 'Technology Scale-up',          desc: 'Full people function build from 12 to 80 people, role scoring and hiring structure embedded throughout' },
  { label: 'Manufacturing and Industrial', desc: 'Restructure and redundancy programme, TUPE transfer, policy overhaul' },
  { label: 'Healthcare and Services',      desc: 'Compliance overhaul, full policy library, manager training programme' },
];

export default function AboutPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-narrow">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            About The People System
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
            Not HR with a bit of recruitment.<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Not recruitment pretending to do HR.
            </span>
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            The People System is Lucy and Tom. Between them: 18+ years of senior HR and People leadership, 10+ years of talent and recruitment expertise, and a track record across every sector a founder-led business is likely to sit in.
          </p>
          <p className="text-base leading-relaxed mt-4 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            A proper blend. One partner. No handoffs. No juniors. Just two people who know how to fix it.
          </p>
        </div>
      </section>

      {/* Lucy */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="eyebrow mb-3">Co-Founder — HR and People</p>
              <h2
                style={{
                  fontFamily: 'var(--font-cormorant), serif',
                  fontWeight: 600,
                  fontSize: '2.25rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                  marginBottom: '1.25rem',
                }}
              >
                Lucy
              </h2>
              <div className="space-y-4 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                <p>
                  Lucy spent over 18 years inside large, complex organisations — leading People functions through acquisitions, rapid growth, restructures, and the kind of people challenges that rarely appear in the same form twice. CIPD qualified. TUPE specialist. Zero tribunal outcomes across her entire career.
                </p>
                <p>
                  She founded Ravello HR because she kept seeing the same pattern: brilliant businesses held back by missing documentation, managers making it up, and compliance exposure that no one had properly reviewed. The fix was never complicated — but it required someone senior enough to do it properly.
                </p>
                <p>
                  Lucy leads PROTECT and LEAD at The People System. Contracts, handbooks, compliance, fractional HR leadership, manager enablement, people strategy. If it sits in the HR function, it goes through Lucy.
                </p>
              </div>
              <div className="mt-8">
                <Link href="/book" className="btn-gradient">
                  Work with Lucy <ArrowRight size={16} />
                </Link>
              </div>
            </div>
            <div>
              <div className="rounded-[18px] p-6" style={{ background: 'var(--bg)', border: '1px solid var(--brand-line)' }}>
                <p className="eyebrow mb-4">Lucy&rsquo;s credentials</p>
                <ul className="space-y-2">
                  {lucyCredentials.map((c) => (
                    <li key={c} className="flex items-start gap-3">
                      <CheckCircle className="flex-shrink-0 mt-0.5" size={14} style={{ color: 'var(--brand-purple)' }} />
                      <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{c}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--brand-line)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Covers</p>
                  <div className="flex flex-wrap gap-2">
                    {['PROTECT', 'LEAD', 'DealReady People'].map((tag) => (
                      <span key={tag} className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)', color: 'var(--ink-soft)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tom */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="eyebrow mb-3">Co-Founder — Talent and Recruitment</p>
              <h2
                style={{
                  fontFamily: 'var(--font-cormorant), serif',
                  fontWeight: 600,
                  fontSize: '2.25rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                  marginBottom: '1.25rem',
                }}
              >
                Tom
              </h2>
              <div className="space-y-4 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                <p>
                  Tom is a serial entrepreneur in recruitment and technology. His true passion is recruitment — built and led through Andrews Recruitment Group, embedding inside founder-led and PE-backed businesses as a hands-on talent lead for over a decade.
                </p>
                <p>
                  Alongside ARG, Tom built RecXchange — a recruiter networking and collaboration platform with over 15,000 recruiters — and RecX Direct, its business development arm that connects live client roles directly with independent recruiters. He also founded IvyLens Technology, known for the Friction Lens role scoring platform and its automated outreach tools, and AMIVY Designs, a website and lead generation studio focused on sales and marketing.
                </p>
                <p>
                  Tom leads HIRE at The People System. Role definition, embedded recruitment delivery, process design, and Friction Lens scoring on every active role. If it involves finding and securing great people, it goes through Tom.
                </p>
              </div>
              <div className="mt-8">
                <Link href="/book" className="btn-gradient">
                  Work with Tom <ArrowRight size={16} />
                </Link>
              </div>
            </div>
            <div>
              <div className="rounded-[18px] p-6" style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}>
                <p className="eyebrow mb-4">Tom&rsquo;s credentials</p>
                <ul className="space-y-2">
                  {tomCredentials.map((c) => (
                    <li key={c} className="flex items-start gap-3">
                      <CheckCircle className="flex-shrink-0 mt-0.5" size={14} style={{ color: 'var(--brand-purple)' }} />
                      <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{c}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--brand-line)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Covers</p>
                  <div className="flex flex-wrap gap-2">
                    {['HIRE', 'Andrews Recruitment Group', 'RecXchange', 'IvyLens Technology', 'AMIVY Designs'].map((tag) => (
                      <span key={tag} className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'var(--bg)', border: '1px solid var(--brand-line)', color: 'var(--ink-soft)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Combined positioning */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-narrow text-center">
          <h2
            style={{
              fontFamily: 'var(--font-cormorant), serif',
              fontWeight: 300,
              fontSize: 'clamp(1.75rem, 4vw, 3rem)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: '#fff',
              marginBottom: '1.5rem',
            }}
          >
            &ldquo;Hire. Lead. Protect.&rdquo;
          </h2>
          <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Most businesses separate hiring from HR. They use an agency for one, a consultant for the other, and nobody joins the dots. The People System is built around the idea that a great people function needs both — working together, from the same starting point, towards the same business outcome.
          </p>
          <p className="text-base leading-relaxed max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Tom and Lucy talk. They share context. When a client comes through HIRE and needs documentation built, PROTECT is already briefed. When a LEAD engagement surfaces a hiring challenge, HIRE is already on it. One partner. Total control of your people function.
          </p>
        </div>
      </section>

      {/* Sector experience */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="text-center mb-12">
            <p className="eyebrow justify-center mb-3">Proof of Work</p>
            <h2 className="section-title mb-4">Experience across every sector</h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--ink-soft)' }}>
              Client names stay confidential. The outcomes do not.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sectorExperience.map((b) => (
              <div key={b.label} className="card">
                <Building2 className="mb-3" size={22} style={{ color: 'var(--brand-purple)' }} />
                <h3 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>{b.label}</h3>
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-sm" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title mb-4">Ready to work together?</h2>
          <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Book a free call. Bring your current people challenge — whether it is hiring, compliance, or leadership — and leave with a clear, actionable next step.
          </p>
          <Link href="/book" className="btn-gradient">
            Book a Free Call <ArrowRight size={16} />
          </Link>
        </div>
      </section>

    </div>
  );
}
