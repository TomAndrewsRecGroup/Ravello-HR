import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, CheckCircle2, XCircle, Minus } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Why Ravello HR',
  description: 'Why ambitious UK businesses choose Ravello HR over traditional agencies, in-house HR, and generic consultants.',
};

const COMPARISON = [
  { feature: 'Named, outcome-led system',                          ravello: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'Senior expert on your account (day 1 to end)',       ravello: true,  agency: false,   inhouse: 'maybe', generic: false },
  { feature: 'Fixed scope — no billing surprises',                 ravello: true,  agency: false,   inhouse: true,    generic: false },
  { feature: 'Embeds within 48 hours',                             ravello: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'Covers hiring, compliance AND transformation',        ravello: true,  agency: false,   inhouse: 'maybe', generic: false },
  { feature: 'No long-term retainer required',                     ravello: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'CIPD qualified & TUPE specialist',                   ravello: true,  agency: false,   inhouse: 'maybe', generic: 'maybe' },
  { feature: '0 tribunal outcomes track record',                   ravello: true,  agency: false,   inhouse: false,   generic: false },
];

const OBJECTIONS = [
  {
    q: 'We already use a recruitment agency.',
    a: 'Agencies fill roles — they don\u2019t fix why roles keep reopening. The Smart Hiring System does. Most clients cut their agency spend by 40%+ within a year.',
  },
  {
    q: 'We have an in-house HR person.',
    a: 'Great. We work alongside them — not over them. Ravello HR brings specialist depth in areas (TUPE, M&A, compliance architecture) that most generalists don\u2019t cover day-to-day.',
  },
  {
    q: 'We\u2019ve used HR consultants before and it didn\u2019t work.',
    a: 'That\u2019s usually because you got junior delivery on a senior pitch, or vague advice with no clear deliverable. Every Ravello engagement has a named system, a fixed scope, and a senior lead.',
  },
  {
    q: 'We can\u2019t afford a consultant right now.',
    a: 'One tribunal claim costs an average of \u00a38,500\u2013\u00a330,000+. One bad hire costs 3x salary. PolicySafe\u2122 and the Smart Hiring System typically pay for themselves inside 6 months.',
  },
];

const REASONS = [
  {
    icon: '\uD83C\uDFAF',
    title: 'A system, not a service',
    body: 'Every engagement is built around one of three named systems. You always know what you\u2019re getting, why, and when it ends.',
  },
  {
    icon: '\uD83D\uDC64',
    title: 'One senior expert, start to finish',
    body: 'You get the same senior lead — not a junior who was briefed by someone you met once. Senior thinking on every call, every deliverable.',
  },
  {
    icon: '\u26A1',
    title: 'Embedded fast',
    body: 'Typically active within 48 hours of engagement. No lengthy onboarding, no 6-week discovery phase — we learn your business by working in it.',
  },
  {
    icon: '\uD83D\uDCCB',
    title: 'Fixed scope',
    body: 'You know the cost before we start. No open-ended retainers, no scope creep, no surprise invoices.',
  },
  {
    icon: '\uD83D\uDD12',
    title: 'Fully confidential',
    body: 'All engagements are handled under strict confidentiality. Names never appear in case studies without explicit permission.',
  },
  {
    icon: '\uD83C\uDFC6',
    title: '0 tribunal outcomes',
    body: 'Across every restructure, TUPE transfer and disciplinary process handled. That\u2019s not luck — it\u2019s process.',
  },
];

function Cell({ val }: { val: boolean | string }) {
  if (val === true)  return <CheckCircle2 size={20} className="mx-auto" style={{ color: 'var(--brand-purple)' }} />;
  if (val === false) return <XCircle      size={20} className="mx-auto" style={{ color: 'var(--ink-faint)' }} />;
  return <Minus size={20} className="mx-auto" style={{ color: 'var(--ink-faint)' }} />;
}

export default function WhyRavelloPage() {
  return (
    <main>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-narrow section-padding py-0 text-center px-6" style={{ paddingLeft: "1.5rem", paddingRight: "1.5rem" }}>
          <p className="eyebrow justify-center mb-6">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#9B7FF8' }} />
            Why Ravello HR
          </p>
          <h1
            style={{ fontFamily: 'var(--font-cormorant), serif', fontSize: 'clamp(2.5rem,5vw,4.2rem)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--ink)', marginBottom: '1.25rem' }}
          >
            Senior HR expertise.<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 600 }}
            >
              Built differently.
            </span>
          </h1>
          <p className="text-lg leading-relaxed max-w-[540px] mx-auto mb-10" style={{ color: 'var(--ink-soft)' }}>
            We&rsquo;re not a recruitment agency. We&rsquo;re not a retainer consultancy. We&rsquo;re a named-system HR practice that fixes real problems &mdash; fast.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/book" className="btn-gradient"><CalendarCheck size={16} /> Book a Free Call</Link>
            <Link href="#comparison" className="btn-secondary">See the comparison <ArrowRight size={15} /></Link>
          </div>
        </div>
      </section>

      {/* 6 Reasons */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="max-w-[560px] mb-16">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              What makes us different
            </p>
            <h2 className="section-title">Six reasons clients choose Ravello.</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {REASONS.map((r) => (
              <div key={r.title} className="card">
                <span className="text-3xl mb-5 block">{r.icon}</span>
                <h3 className="font-bold text-lg mb-3" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>{r.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section id="comparison" className="section-padding" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-wide">
          <div className="max-w-[560px] mb-14">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Why not an agency
            </p>
            <h2 className="section-title">How we compare.</h2>
            <p className="text-lg mt-5 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Side by side &mdash; Ravello HR vs. the alternatives.</p>
          </div>

          <div className="overflow-x-auto rounded-[22px]" style={{ border: '1px solid var(--brand-line)', boxShadow: '0 2px 20px rgba(13,21,53,0.05)' }}>
            <table className="w-full text-sm" style={{ minWidth: '640px' }}>
              <thead>
                <tr style={{ background: 'var(--brand-navy)' }}>
                  <th className="text-left px-8 py-5 font-semibold" style={{ color: 'rgba(255,255,255,0.5)', width: '36%' }}>Feature</th>
                  <th className="text-center px-6 py-5 font-bold text-white" style={{ background: 'rgba(124,92,246,0.25)' }}>Ravello HR</th>
                  <th className="text-center px-6 py-5 font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>Agency</th>
                  <th className="text-center px-6 py-5 font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>In-house HR</th>
                  <th className="text-center px-6 py-5 font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>Generic consultant</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr
                    key={row.feature}
                    style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface-alt)', borderTop: '1px solid var(--brand-line)' }}
                  >
                    <td className="px-8 py-4 font-medium" style={{ color: 'var(--ink)' }}>{row.feature}</td>
                    <td className="px-6 py-4 text-center" style={{ background: 'rgba(124,92,246,0.04)' }}><Cell val={row.ravello} /></td>
                    <td className="px-6 py-4 text-center"><Cell val={row.agency} /></td>
                    <td className="px-6 py-4 text-center"><Cell val={row.inhouse} /></td>
                    <td className="px-6 py-4 text-center"><Cell val={row.generic} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Objection handling */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="max-w-[560px] mb-14">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Common questions
            </p>
            <h2 className="section-title">We&rsquo;ve heard it before.</h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            {OBJECTIONS.map((o) => (
              <div key={o.q} className="card">
                <p className="font-bold text-base mb-4" style={{ color: 'var(--ink)' }}>&ldquo;{o.q}&rdquo;</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{o.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding relative overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(124,92,246,0.08) 0%, transparent 65%)' }} />
        <div className="relative z-10 container-narrow text-center">
          <h2 className="section-title mb-6">Ready to talk?</h2>
          <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--ink-soft)' }}>
            30 minutes. No pitch. Just an honest conversation about what&rsquo;s slowing your business down.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/book" className="btn-gradient"><CalendarCheck size={16} /> Book a Free Call</Link>
            <Link href="/tools/hiring-score" className="btn-secondary">Try Hiring Score first <ArrowRight size={14} /></Link>
          </div>
        </div>
      </section>

    </main>
  );
}
