import { Metadata } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, CheckCircle, Clock, MessageSquare, Zap } from 'lucide-react';

// Dynamically import the embed — ssr:false prevents the iframe hanging static generation
const BookingEmbed = dynamic(() => import('@/components/BookingEmbed'), { ssr: false });

export const metadata: Metadata = {
  title: 'Book a Free Call | No-Fluff HR Hotline | Ravello HR',
  description:
    'Book 15 minutes with Lucinda. Bring your biggest HR challenge. Leave with clarity and a clear next step. No sales pitch, no obligation.',
  alternates: { canonical: 'https://ravellohr.co.uk/book' },
};

const whatToExpect = [
  'You talk, Lucinda listens. No scripted discovery process, no agenda to push.',
  'You get a straight read on whether the problem is hiring, compliance or people risk',
  'You leave with one to three specific next steps you can act on straight away',
  'No pitch deck. No follow-up pressure. Absolutely no obligation.',
];

const goodFor = [
  { label: "A hiring problem",        desc: "A role that keeps reopening, a process that moves too slowly or an agency bill that has spiralled" },
  { label: "A compliance concern",    desc: "Contracts you are not confident in, a policy gap you have noticed or a manager applying rules inconsistently" },
  { label: "A deal or restructure",   desc: "An acquisition in progress, redundancies under consideration or an integration you need to get right first time" },
  { label: "A people situation",      desc: "A grievance, a performance issue or a difficult conversation you are not quite sure how to approach" },
];

const notFor = [
  'General career advice',
  'Employment law queries requiring a solicitor',
  'Requests for free ongoing support',
];

// Replace with Lucinda's real Google Calendar appointment schedule URL when ready
const BOOKING_URL = 'https://calendar.google.com/calendar/appointments/schedules/YOUR_SCHEDULE_ID';
const BOOKING_READY = !BOOKING_URL.includes('YOUR_SCHEDULE_ID');

export default function BookPage() {
  return (
    <div className="pt-20">

      {/* Hero */}
      <section className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 text-center" style={{ background: 'var(--brand-navy)' }}>
        <div className="max-w-3xl mx-auto">
          <span className="eyebrow mb-6 inline-block" style={{ color: 'var(--brand-blue)' }}>No-Fluff HR Hotline</span>
          <h1
            style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '1.25rem', fontSize: 'clamp(2.4rem,5vw,3.8rem)', color: '#fff' }}
          >
            Fifteen minutes.<br />
            <span style={{ background: 'linear-gradient(135deg,var(--brand-blue),var(--brand-purple),var(--brand-pink))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Bring your challenge.
            </span><br />
            Leave with a clear path.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1.1rem' }}>
            One honest conversation. No slides. No pitch. Just a straight answer on what your people problem is and exactly what to do about it.
          </p>
        </div>
      </section>

      {/* Main content + booking */}
      <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12">

            {/* Left: context */}
            <div className="space-y-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={20} style={{ color: 'var(--brand-purple)' }} />
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>What happens in 15 minutes</h2>
                </div>
                <ul className="space-y-3">
                  {whatToExpect.map((item) => (
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
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>This call is right for you if…</h2>
                </div>
                <div className="space-y-3">
                  {goodFor.map((item) => (
                    <div key={item.label} className="bg-white rounded-[16px] p-4"
                      style={{ border: '1px solid var(--brand-line)', boxShadow: '0 1px 6px rgba(14,22,51,0.04)' }}
                    >
                      <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>{item.label}</p>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[14px] p-4" style={{ background: 'rgba(143,114,246,0.06)', border: '1px solid rgba(143,114,246,0.15)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={16} style={{ color: 'var(--ink-soft)' }} />
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink-soft)' }}>This call is not the right fit if you need…</p>
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

            {/* Right: booking */}
            <div className="bg-white rounded-[20px] p-6 lg:p-8" style={{ border: '1px solid var(--brand-line)', boxShadow: '0 4px 24px rgba(14,22,51,0.06)' }}>
              <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Pick a time</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>All times shown in UK time (GMT/BST). Video call link sent on confirmation.</p>

              {BOOKING_READY ? (
                <BookingEmbed src={BOOKING_URL} />
              ) : (
                /* Placeholder shown until the real Google Calendar URL is configured */
                <div className="rounded-[14px] p-8 text-center" style={{ background: 'var(--surface-alt)', border: '1px dashed var(--brand-line)' }}>
                  <p className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>Booking calendar coming very soon</p>
                  <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>While the scheduler gets set up, drop us a direct message:</p>
                  <a
                    href="mailto:hello@ravellohr.co.uk?subject=Book a Free Call"
                    className="btn-primary inline-flex"
                  >
                    Email to Book
                  </a>
                </div>
              )}

              <p className="text-xs mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
                Prefer email?{' '}
                <a href="mailto:hello@ravellohr.co.uk" style={{ color: 'var(--brand-purple)' }}>hello@ravellohr.co.uk</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Not ready yet */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-narrow text-center">
          <p className="eyebrow mb-8">Not quite ready to book? Start here instead.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { href: '/tools/hiring-score',         label: 'Smart Hiring Score',  sub: '3 mins · Free · Instant results' },
              { href: '/tools/hr-risk-score',        label: 'HR Risk Score',        sub: '2 mins · Free · Gap report' },
              { href: '/tools/due-diligence-checklist', label: 'DD Checklist',     sub: 'M&A · Free · Downloadable' },
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
