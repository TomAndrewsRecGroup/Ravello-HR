import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, CheckCircle2, XCircle, Minus,
  Layers, Users, Zap, ClipboardCheck, Lock, Award,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Why The People System | The People System',
  description: 'Why ambitious UK businesses choose The People System over recruitment agencies, in-house HR, and generic consultants. One partner. Senior throughout. Fixed scope.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/why-tps' },
};

const COMPARISON = [
  { feature: 'Named, outcome-led system',                          tps: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'Senior expert on your account, day 1 to end',        tps: true,  agency: false,   inhouse: 'maybe', generic: false },
  { feature: 'Fixed scope. No billing surprises.',                 tps: true,  agency: false,   inhouse: true,    generic: false },
  { feature: 'Embedded fast, no discovery phase',                  tps: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'Covers hiring, compliance AND transformation',       tps: true,  agency: false,   inhouse: 'maybe', generic: false },
  { feature: 'No long-term retainer required',                     tps: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'CIPD qualified and TUPE specialist',                 tps: true,  agency: false,   inhouse: 'maybe', generic: 'maybe' },
  { feature: '0 tribunal outcomes track record',                   tps: true,  agency: false,   inhouse: false,   generic: false },
];

const OBJECTIONS = [
  {
    q: 'We already use a recruitment agency.',
    a: 'Agencies fill roles. They do not fix why roles keep reopening. HIRE addresses the root cause: Friction Lens, better role definition, faster process. Most clients cut agency spend by 40-60% within a year.',
  },
  {
    q: 'We have an in-house HR person.',
    a: 'We work alongside them, not over them. We bring depth in TUPE, M&A, and compliance architecture that most generalist HR professionals do not cover day-to-day. Your in-house person stays close to the team. We sit underneath them on the hard, specialist work.',
  },
  {
    q: 'We’ve used HR consultants before and it didn’t work.',
    a: 'Usually because you got junior delivery on a senior pitch, or vague advice with nothing concrete attached. Every engagement here has a named system, a fixed scope, and a senior lead from start to end. Lucy and Tom only.',
  },
  {
    q: 'We can’t afford a consultant right now.',
    a: 'A single unfair dismissal tribunal award averages £13,749, with discrimination claims averaging £45,000 or more (MoJ, 2023/24). One bad mid-level hire costs over £132,000 (REC). PROTECT and HIRE typically pay for themselves within six months.',
  },
];

const REASONS = [
  {
    icon: Layers,
    color: '#7B2FBE',
    title: 'A system, not a service',
    body: 'Every engagement is built around one of three named systems: HIRE, LEAD, or PROTECT. You always know what you are getting and when it is done.',
  },
  {
    icon: Users,
    color: '#4B6EF5',
    title: 'One senior expert, start to finish',
    body: 'Same senior lead the whole way through. Not a junior briefed by someone you met once. Senior thinking on every call, every deliverable.',
  },
  {
    icon: Zap,
    color: '#EA3DC4',
    title: 'Embedded fast',
    body: 'No discovery phase. We learn your business by working inside it, not by sitting through workshops.',
  },
  {
    icon: ClipboardCheck,
    color: '#2E8B7A',
    title: 'Fixed scope, clear cost',
    body: 'You know the investment before we start. No open-ended retainers. No scope creep. No invoices that catch you off guard.',
  },
  {
    icon: Lock,
    color: '#B45309',
    title: 'Fully confidential',
    body: 'Every engagement is handled with discretion. Your name never appears in our case studies without explicit consent.',
  },
  {
    icon: Award,
    color: '#16A34A',
    title: 'Zero tribunal outcomes',
    body: 'Across every restructure, TUPE transfer, and disciplinary process Lucy has built a case for. That is not luck. It is the result of doing things properly.',
  },
];

function Cell({ val }: { val: boolean | string }) {
  if (val === true)  return <CheckCircle2 size={20} className="mx-auto" style={{ color: 'var(--brand-purple)' }} />;
  if (val === false) return <XCircle      size={20} className="mx-auto" style={{ color: 'var(--ink-faint)' }} />;
  return <Minus size={20} className="mx-auto" style={{ color: 'var(--ink-faint)' }} />;
}

export default function WhyTPSPage() {
  return (
    <div className="pt-28">

      {/* Hero — matches /hire and /protect layout (text + image) */}
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem 2.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-14 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                Why The People System
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
                Senior HR.<br />
                <span className="text-gradient">Built differently.</span>
              </h1>
              <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                Not a recruitment agency. Not a retainer consultancy. A people practice built to fix the real problems at the root, across hiring, HR leadership, and compliance.
              </p>
              <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
                One partner. Senior throughout. Fixed scope. The same senior lead from day one to handover.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
                <Link href="#comparison" className="btn-secondary">See the comparison <ArrowRight size={15} /></Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image
                  src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=960&h=960&fit=crop&crop=faces"
                  alt="Senior consultants discussing a client's people strategy"
                  fill
                  className="object-cover"
                  sizes="420px"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Six reasons — lucide icons in tinted bg circles, matches /hire dimensions style */}
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              What makes us different
            </p>
            <h2
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
              }}
            >
              Six reasons businesses choose<br />
              <span className="text-gradient">The People System.</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {REASONS.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.title} className="rounded-[18px] p-7" style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}>
                  <div
                    className="w-11 h-11 rounded-[12px] flex items-center justify-center mb-5"
                    style={{ background: `${r.color}15`, border: `1px solid ${r.color}30` }}
                  >
                    <Icon size={20} style={{ color: r.color }} />
                  </div>
                  <h3 className="font-bold text-lg mb-3" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, fontSize: '1.35rem', letterSpacing: '-0.015em' }}>
                    {r.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{r.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison table — kept in tone with /hire and /protect packages section */}
      <section id="comparison" style={{ background: 'var(--surface-alt)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Why not an agency
            </p>
            <h2
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
              }}
            >
              How we<br />
              <span className="text-gradient">compare.</span>
            </h2>
            <p className="text-lg mt-5 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>The People System against the alternatives. Side by side.</p>
          </div>

          <div className="overflow-x-auto rounded-[22px]" style={{ border: '1px solid var(--brand-line)', boxShadow: '0 2px 20px rgba(13,21,53,0.05)' }}>
            <table className="w-full text-sm" style={{ minWidth: '640px' }}>
              <thead>
                <tr style={{ background: 'var(--brand-navy)' }}>
                  <th className="text-left px-8 py-5 font-semibold" style={{ color: 'rgba(255,255,255,0.5)', width: '36%' }}>Feature</th>
                  <th className="text-center px-6 py-5 font-bold text-white" style={{ background: 'rgba(124,92,246,0.25)' }}>The People System</th>
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
                    <td className="px-6 py-4 text-center" style={{ background: 'rgba(124,92,246,0.04)' }}><Cell val={row.tps} /></td>
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
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Common questions
            </p>
            <h2
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
              }}
            >
              We hear these a lot.<br />
              <span className="text-gradient">Here are the honest answers.</span>
            </h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            {OBJECTIONS.map((o) => (
              <div key={o.q} className="rounded-[18px] p-7" style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}>
                <p className="font-bold text-base mb-4" style={{ color: 'var(--ink)' }}>&ldquo;{o.q}&rdquo;</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{o.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — matches the rest of the site's closing CTA pattern (split image / text) */}
      <section style={{ background: 'var(--surface-alt)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-14 items-center">
            <div>
              <h2
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                Ready to have an<br />
                <span className="text-gradient">honest conversation?</span>
              </h2>
              <p className="text-lg mb-8 max-w-xl" style={{ color: 'var(--ink-soft)' }}>
                No pitch. A straight conversation about what is holding your business back and what to do about it. You leave with one to three specific next steps you can act on, whether you work with us or not.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
                <Link href="/about" className="btn-secondary">Meet Lucy and Tom <ArrowRight size={14} /></Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image
                  src="https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?w=960&h=960&fit=crop&crop=faces"
                  alt="Business professionals having a focused conversation"
                  fill
                  className="object-cover"
                  sizes="420px"
                />
                <div className="absolute inset-x-0 bottom-0 p-6" style={{ background: 'linear-gradient(to top, rgba(5,8,16,0.88) 0%, rgba(5,8,16,0.45) 60%, transparent 100%)' }}>
                  <p className="text-white text-sm leading-relaxed mb-2" style={{ fontStyle: 'italic', opacity: 0.95 }}>
                    &ldquo;Not HR from a textbook. People results from operators who have done the real work.&rdquo;
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Lucy &amp; Tom, The People System
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
