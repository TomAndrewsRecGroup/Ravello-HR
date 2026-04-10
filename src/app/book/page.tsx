import { Metadata } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, CheckCircle, Clock, MessageSquare, Zap } from 'lucide-react';

// Dynamically import the embed: ssr:false prevents the iframe hanging static generation
const BookingEmbed = dynamic(() => import('@/components/BookingEmbed'), { ssr: false });

export const metadata: Metadata = {
  title: 'Book a Free Call | The People System',
  description:
    'Three routes: I need help hiring / I need HR foundations / I\'m going through a deal. Book a free call with Lucy or Tom. Straight answers. No pitch.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/book' },
};

const whatToExpect = [
  'You describe the situation. We listen. No scripted process, no agenda to push.',
  'You get a straight read on what the problem actually is: hiring, foundations, or people risk',
  'You leave with one to three specific next steps you can act on immediately',
  'No pitch deck. No follow-up pressure. No obligation.',
];

const goodFor = [
  {
    label: 'I need help hiring',
    desc: 'A role that keeps reopening. An agency bill that has spiralled. A process that moves too slowly. Managers who hire inconsistently. Tom will assess the situation and run a Friction Lens score on any active role.',
    who: 'Book a Call',
    colour: 'var(--brand-purple)',
  },
  {
    label: 'I need HR foundations',
    desc: 'Missing contracts. An outdated handbook. Compliance exposure you have been meaning to fix. Employment Rights Bill changes you are not ready for. Lucy will audit your current position and tell you exactly what needs fixing first.',
    who: 'Book a Call',
    colour: 'var(--brand-blue)',
  },
  {
    label: "I'm going through a deal",
    desc: 'An acquisition, a merger, a TUPE transfer, or a restructure. People risk found after completion belongs to you. Lucy will assess what needs reviewing and when to start.',
    who: 'Book a Call',
    colour: 'var(--brand-pink)',
  },
];

const notFor = [
  'General career advice',
  'Employment law queries requiring a solicitor',
  'Requests for free ongoing support',
];

// Booking URL — set NEXT_PUBLIC_BOOKING_URL in .env to activate the embedded calendar
const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? '';
const BOOKING_READY = BOOKING_URL.length > 0 && !BOOKING_URL.includes('YOUR_SCHEDULE_ID');

export default function BookPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 text-center" style={{ background: 'var(--brand-navy)' }}>
        <div className="max-w-3xl mx-auto">
          <span className="eyebrow mb-6 inline-block" style={{ color: 'var(--brand-blue)' }}>The People System: Free Call</span>
          <h1
            style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '1.25rem', fontSize: 'clamp(2.4rem,5vw,3.8rem)', color: '#fff' }}
          >
            Bring your challenge.<br />
            <span style={{ background: 'linear-gradient(135deg,var(--brand-blue),var(--brand-purple),var(--brand-pink))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Leave with a clear path.
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1.1rem' }}>
            One honest conversation. No slides. No pitch. Just a straight answer on what the problem is and exactly what to do about it.
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
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>What happens on the call</h2>
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
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Which challenge fits you?</h2>
                </div>
                <div className="space-y-3">
                  {goodFor.map((item) => (
                    <div key={item.label} className="bg-white rounded-[16px] p-4"
                      style={{ border: '1px solid var(--brand-line)', boxShadow: '0 1px 6px rgba(14,22,51,0.04)', borderLeft: `3px solid ${item.colour}` }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{item.label}</p>
                        <span className="text-xs font-semibold" style={{ color: item.colour }}>{item.who}</span>
                      </div>
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
              <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>All times shown in UK time (GMT/BST). Video call link sent on confirmation. Note in the booking which challenge you are bringing and we will route you to the right person.</p>

              {BOOKING_READY ? (
                <BookingEmbed src={BOOKING_URL} />
              ) : (
                /* Placeholder shown until the real Google Calendar URL is configured */
                <div className="rounded-[14px] p-8 text-center" style={{ background: 'var(--surface-alt)', border: '1px dashed var(--brand-line)' }}>
                  <p className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>Booking calendar coming very soon</p>
                  <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>While the scheduler gets set up, drop us a direct message:</p>
                  <a
                    href="mailto:info@thepeoplesystem.co.uk?subject=Book a Free Call"
                    className="btn-primary inline-flex"
                  >
                    Email to Book
                  </a>
                </div>
              )}

              <p className="text-xs mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
                Prefer email?{' '}
                <a href="mailto:info@thepeoplesystem.co.uk" style={{ color: 'var(--brand-purple)' }}>info@thepeoplesystem.co.uk</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Not ready yet */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-narrow text-center">
          <p className="eyebrow mb-8">Not quite ready to book? Use one of these first.</p>
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
