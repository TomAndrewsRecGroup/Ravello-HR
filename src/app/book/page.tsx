import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Clock, MessageSquare, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Book a Free Call | No-Fluff HR Hotline | Ravello HR',
  description:
    'Book 15 minutes with Lucinda. Bring your HR mess. Leave with clarity and a clear next step — no sales pitch, no obligation.',
  alternates: { canonical: 'https://ravellohr.co.uk/book' },
};

const whatToExpect = [
  'You talk, Lucinda listens — no scripted discovery process',
  'You get a clear read on whether the problem is hiring, compliance or people risk',
  'You leave with 1–3 specific next steps you can act on immediately',
  'No pitch deck. No follow-up pressure. No obligation.',
];

const goodFor = [
  { label: 'A hiring problem', desc: 'Role that keeps getting reopened, process that’s too slow, agency bill that’s out of control' },
  { label: 'A compliance concern', desc: 'Contracts you’re not sure about, a policy gap you’ve spotted, a manager doing something inconsistent' },
  { label: 'A deal or restructure', desc: 'Acquisition in progress, redundancies being considered, integration you need to get right' },
  { label: 'A people situation', desc: 'Grievance, performance issue, or a conversation you’re not sure how to handle' },
];

const notFor = [
  'General career advice',
  'Employment law queries requiring a solicitor',
  'Requests for free ongoing support',
];

export default function BookPage() {
  return (
    <div className="pt-20">

      {/* Hero */}
      <section className="gradient-hero text-white py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <span className="funnel-tag bg-white/20 border border-white/30 text-white mb-6 inline-block">No-Fluff HR Hotline</span>
          <h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 leading-tight">
            Book 15 mins.<br />
            <span className="text-gradient">Bring your mess.</span><br />
            Leave with clarity.
          </h1>
          <p className="text-white/80 text-xl max-w-2xl mx-auto">
            One conversation. No slides. No pitch. Just a straight answer on what your people problem is and what to do about it.
          </p>
        </div>
      </section>

      {/* Main content + calendar */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12">

            {/* Left: context */}
            <div className="space-y-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="text-brand-teal" size={22} />
                  <h2 className="font-display text-2xl font-bold text-brand-navy">What happens in 15 minutes</h2>
                </div>
                <ul className="space-y-3">
                  {whatToExpect.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="text-brand-teal flex-shrink-0 mt-0.5" size={18} />
                      <span className="text-brand-slate text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="text-brand-teal" size={22} />
                  <h2 className="font-display text-2xl font-bold text-brand-navy">This call is right for you if…</h2>
                </div>
                <div className="space-y-3">
                  {goodFor.map((item) => (
                    <div key={item.label} className="bg-white rounded-xl p-4 border border-gray-100">
                      <p className="font-semibold text-brand-navy text-sm mb-1">{item.label}</p>
                      <p className="text-brand-slate text-xs leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-brand-light rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="text-brand-slate" size={18} />
                  <p className="font-semibold text-brand-slate text-sm">This call is not the right fit for…</p>
                </div>
                <ul className="space-y-1">
                  {notFor.map((item) => (
                    <li key={item} className="text-brand-slate text-xs flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-slate/40 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right: booking embed */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:p-8">
              <h2 className="font-display text-2xl font-bold text-brand-navy mb-2">Pick a time</h2>
              <p className="text-brand-slate text-sm mb-6">All times shown in UK time (GMT/BST). Video call link sent on confirmation.</p>

              {/* Google Calendar Appointment Schedule embed */}
              {/* Replace the src URL below with Lucinda’s actual Google Calendar appointment page */}
              <div className="rounded-xl overflow-hidden border border-gray-100 bg-brand-offwhite">
                <iframe
                  src="https://calendar.google.com/calendar/appointments/schedules/YOUR_SCHEDULE_ID"
                  style={{ border: 0, width: '100%', height: 520 }}
                  frameBorder="0"
                  title="Book a free call with Ravello HR"
                />
              </div>

              <p className="text-brand-slate text-xs mt-4 text-center">
                Prefer email? Reach us at{' '}
                <a href="mailto:hello@ravellohr.co.uk" className="text-brand-teal hover:underline">
                  hello@ravellohr.co.uk
                </a>
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="section-padding bg-white">
        <div className="container-narrow text-center">
          <p className="text-brand-slate text-sm uppercase tracking-widest font-semibold mb-8">Not ready to book yet?</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Link href="/tools/hiring-score" className="card hover:border-brand-teal hover:shadow-md transition-all text-center">
              <p className="font-semibold text-brand-navy text-sm mb-1">Smart Hiring Score</p>
              <p className="text-brand-slate text-xs">3 mins · Free · Instant results</p>
              <span className="text-brand-teal text-xs font-medium mt-2 inline-flex items-center gap-1">Start <ArrowRight size={12} /></span>
            </Link>
            <Link href="/tools/hr-risk-score" className="card hover:border-brand-gold hover:shadow-md transition-all text-center">
              <p className="font-semibold text-brand-navy text-sm mb-1">HR Risk Score</p>
              <p className="text-brand-slate text-xs">2 mins · Free · Gap report</p>
              <span className="text-brand-teal text-xs font-medium mt-2 inline-flex items-center gap-1">Start <ArrowRight size={12} /></span>
            </Link>
            <Link href="/tools/due-diligence-checklist" className="card hover:border-brand-navy hover:shadow-md transition-all text-center">
              <p className="font-semibold text-brand-navy text-sm mb-1">DD Checklist</p>
              <p className="text-brand-slate text-xs">M&A · Free · Downloadable</p>
              <span className="text-brand-teal text-xs font-medium mt-2 inline-flex items-center gap-1">Start <ArrowRight size={12} /></span>
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
