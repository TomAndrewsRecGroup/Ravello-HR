import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Clock, MessageSquare, Zap } from 'lucide-react';
import BookForm from './BookForm';

export const metadata: Metadata = {
  title: 'Book a Free Call | The People System',
  description:
    'Tell us about your people challenge: hiring, HR foundations, or a deal. Send the form and Lucy or Tom will be in touch within one business day. Straight answers. No pitch.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/book' },
};

const whatHappensNext = [
  'Send the form with a sentence or two about what is going on.',
  'Lucy or Tom replies within one business day to set a time that works.',
  'On the call: you describe the situation, we listen, you get a straight read on what the problem actually is.',
  'You leave with one to three specific next steps you can act on. No pitch deck, no follow-up pressure, no obligation.',
];

const notFor = [
  'General career advice',
  'Employment law queries requiring a solicitor',
  'Requests for free ongoing support',
];

export default function BookPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 text-center" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto">
          <p className="eyebrow mb-6">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            The People System: Free Call
          </p>
          <h1
            className="font-display mb-5"
            style={{
              fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.04em',
              color: 'var(--ink)',
            }}
          >
            Bring your challenge.<br />
            <span className="text-gradient">Leave with a clear path.</span>
          </h1>
          <p className="text-lg leading-relaxed max-w-[560px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
            One honest conversation. No slides. No pitch. Just a straight answer on what the problem is and exactly what to do about it.
          </p>
        </div>
      </section>

      {/* Main content + form */}
      <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-12">

            {/* Left: context */}
            <div className="space-y-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={20} style={{ color: 'var(--brand-purple)' }} />
                  <h3
                    className="font-display"
                    style={{
                      fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                      fontWeight: 800,
                      lineHeight: 1.05,
                      letterSpacing: '-0.035em',
                      color: 'var(--ink)',
                    }}
                  >
                    What happens next
                  </h3>
                </div>
                <ul className="space-y-3">
                  {whatHappensNext.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle size={17} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--brand-purple)' }} />
                      <span className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare size={20} style={{ color: 'var(--brand-purple)' }} />
                  <h3
                    className="font-display"
                    style={{
                      fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                      fontWeight: 800,
                      lineHeight: 1.05,
                      letterSpacing: '-0.035em',
                      color: 'var(--ink)',
                    }}
                  >
                    Who picks it up
                  </h3>
                </div>
                <div className="space-y-3">
                  <div
                    className="bg-white rounded-[16px] p-4"
                    style={{ border: '1px solid var(--brand-line)', boxShadow: '0 1px 6px rgba(14,22,51,0.04)', borderLeft: '3px solid var(--brand-purple)' }}
                  >
                    <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>Hiring challenges: Tom</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                      Tom will assess the situation and can run a Friction Lens score on any active role before you meet.
                    </p>
                  </div>
                  <div
                    className="bg-white rounded-[16px] p-4"
                    style={{ border: '1px solid var(--brand-line)', boxShadow: '0 1px 6px rgba(14,22,51,0.04)', borderLeft: '3px solid var(--brand-blue)' }}
                  >
                    <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>HR foundations: Lucy</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                      Lucy will audit your current position and tell you exactly what needs fixing first, including any Employment Rights Bill gaps.
                    </p>
                  </div>
                  <div
                    className="bg-white rounded-[16px] p-4"
                    style={{ border: '1px solid var(--brand-line)', boxShadow: '0 1px 6px rgba(14,22,51,0.04)', borderLeft: '3px solid var(--brand-pink)' }}
                  >
                    <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>Deals and transactions: Lucy</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                      For M&amp;A, TUPE or restructure work, Lucy will scope what needs reviewing and when to start.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[14px] p-4" style={{ background: 'rgba(143,114,246,0.06)', border: '1px solid rgba(143,114,246,0.15)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={16} style={{ color: 'var(--ink-soft)' }} />
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink-soft)' }}>This call is not the right fit if you need...</p>
                </div>
                <ul className="space-y-1.5">
                  {notFor.map((item) => (
                    <li key={item} className="text-xs flex items-center gap-2" style={{ color: 'var(--ink-soft)' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ink-faint)' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right: form */}
            <BookForm />
          </div>
        </div>
      </section>

      {/* Not ready yet */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-narrow text-center">
          <p className="eyebrow mb-8">Not quite ready to book? Use one of these first.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { href: '/tools/hiring-score',         label: 'Smart Hiring Score',  sub: '3 mins, free, instant results' },
              { href: '/tools/hr-risk-score',        label: 'HR Risk Score',        sub: '2 mins, free, gap report' },
              { href: '/tools/due-diligence-checklist', label: 'DD Checklist',     sub: 'M&A, free, downloadable' },
            ].map((t) => (
              <Link key={t.href} href={t.href}
                className="bg-white rounded-[16px] p-5 text-center transition-shadow hover:shadow-md"
                style={{ border: '1px solid var(--brand-line)' }}
              >
                <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>{t.label}</p>
                <p className="text-xs mb-2" style={{ color: 'var(--ink-soft)' }}>{t.sub}</p>
                <span className="text-xs font-medium inline-flex items-center gap-1" style={{ color: 'var(--brand-purple)' }}>
                  Start <ArrowRight size={11} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
