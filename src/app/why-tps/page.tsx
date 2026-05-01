import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, CheckCircle2, XCircle, Minus,
  Layers, Users, Zap, ClipboardCheck, Lock, Award,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Why The People System | UK HR Consultancy for Ambitious SMEs',
  description: 'Why ambitious UK SMEs choose The People System: HIRE, LEAD and PROTECT delivered as one connected system. Friction Lens scoring on every role. Senior delivery. Fixed scope. Employment Rights Bill ready.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/why-tps' },
  keywords: ['why The People System', 'HR consultancy UK', 'embedded recruitment', 'fractional HR', 'Friction Lens', 'Employment Rights Bill', 'TUPE specialist', 'SME HR partner'],
};

const COMPARISON = [
  { feature: 'One connected system: HIRE, LEAD and PROTECT',       tps: true,  agency: false,   inhouse: 'maybe', generic: false },
  { feature: 'Friction Lens scoring on every live role',           tps: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'Senior lead (Lucy or Tom) on every engagement',      tps: true,  agency: false,   inhouse: 'maybe', generic: false },
  { feature: 'Fixed scope and fixed cost. No billing surprises.',  tps: true,  agency: false,   inhouse: true,    generic: false },
  { feature: 'Embedded inside your team within days',              tps: true,  agency: false,   inhouse: true,    generic: false },
  { feature: 'Live client portal: hiring, compliance, documents',  tps: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'Employment Rights Bill ready policy stack',          tps: true,  agency: false,   inhouse: 'maybe', generic: 'maybe' },
  { feature: 'CIPD qualified, TUPE and M&A specialist',            tps: true,  agency: false,   inhouse: 'maybe', generic: 'maybe' },
  { feature: 'Zero tribunal outcomes across every case built',     tps: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'No long-term retainer required',                     tps: true,  agency: false,   inhouse: false,   generic: false },
  { feature: 'Cuts agency spend by 40 to 60 percent in year one',  tps: true,  agency: false,   inhouse: false,   generic: false },
];

const OBJECTIONS = [
  {
    q: 'We already use a recruitment agency.',
    a: 'Agencies fill roles. They do not fix why roles keep reopening. HIRE addresses the root cause with Friction Lens scoring, sharper role definition, and a faster process. Most clients cut agency spend by 40 to 60 percent within a year.',
  },
  {
    q: 'We have an in-house HR person.',
    a: 'We work alongside them, not over them. We bring depth in TUPE, M&A, and Employment Rights Bill readiness that most generalist HR professionals do not cover day-to-day. Your in-house person stays close to the team. We sit underneath them on the specialist work.',
  },
  {
    q: 'We have used HR consultants before and it did not work.',
    a: 'Usually because you got junior delivery on a senior pitch, or generic advice with nothing concrete attached. Every engagement here has a named system, a fixed scope, and a senior lead from start to end. Lucy and Tom only.',
  },
  {
    q: 'We are not sure we can afford a consultant right now.',
    a: 'The Cost of Doing Nothing tells the truer story. A single unfair dismissal award averages £13,749, with discrimination claims averaging £45,000 or more (MoJ, 2023/24). One bad mid-level hire costs over £132,000 (REC). HIRE, LEAD and PROTECT typically pay for themselves inside six months.',
  },
  {
    q: 'Can you really do hiring and HR? Most firms do one.',
    a: 'That is exactly the point. Hiring failures and HR failures share the same root causes: weak role definition, poor onboarding, missing policy, untrained managers. One partner across HIRE, LEAD and PROTECT means the fixes connect. Two suppliers means they do not.',
  },
  {
    q: 'How fast can you start?',
    a: 'Days, not weeks. There is no discovery phase. We embed inside your team, run a Friction Lens or HR Risk Score on day one, and ship the first deliverable in week one. You see results before the first invoice clears.',
  },
];

const REASONS = [
  {
    icon: Layers,
    color: '#7B2FBE',
    title: 'One connected system',
    body: 'HIRE, LEAD and PROTECT are designed to work together. Hire the right people. Lead them well. Protect the business legally and culturally. One partner. One operating model. One source of truth.',
  },
  {
    icon: Users,
    color: '#4B6EF5',
    title: 'Senior delivery, start to finish',
    body: 'You get Lucy and Tom on every engagement. Not a junior briefed by someone you met at the pitch. Senior thinking on every call, every brief, every decision.',
  },
  {
    icon: Zap,
    color: '#EA3DC4',
    title: 'Friction Lens on every role',
    body: 'Every live role is scored across location, salary, skills, working model and process before it goes to market. You know where the role will struggle before you spend a day recruiting for it.',
  },
  {
    icon: ClipboardCheck,
    color: '#2E8B7A',
    title: 'Fixed scope, clear cost',
    body: 'You know the investment before we start. No open-ended retainers. No scope creep. No invoices that catch you off guard. Engagements are scoped to your size, not stretched to fit ours.',
  },
  {
    icon: Lock,
    color: '#B45309',
    title: 'Employment Rights Bill ready',
    body: 'Day-one rights, fair work, statutory sick pay reform and zero-hours changes are landing in 2026 and 2027. Your policy stack, contracts and managers need to be ready. PROTECT gets you there before the deadlines bite.',
  },
  {
    icon: Award,
    color: '#16A34A',
    title: 'Zero tribunal outcomes',
    body: 'Across every restructure, TUPE transfer and disciplinary process Lucy has built a case for. Not luck. The result of process, evidence and documentation done properly the first time.',
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
                One people partner.<br />
                <span className="text-gradient">Three connected systems.</span>
              </h1>
              <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                HIRE, LEAD and PROTECT are designed to work as one operating model for your people function. Not a recruitment agency. Not a retainer consultancy. A senior practice built to fix the real causes of hiring, leadership and compliance failure at the root.
              </p>
              <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
                Senior throughout. Fixed scope. Friction Lens on every role. Employment Rights Bill ready. Zero tribunal outcomes across every case built.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
                <Link href="#comparison" className="btn-secondary">See the comparison <ArrowRight size={15} /></Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=960&h=960&fit=crop"
                  alt="A team collaborating in a modern workspace"
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
              Six reasons ambitious SMEs choose<br />
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
              The honest comparison
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
              The People System vs.<br />
              <span className="text-gradient">the alternatives.</span>
            </h2>
            <p className="text-lg mt-5 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>How a connected HIRE, LEAD and PROTECT system stacks up against a recruitment agency, an in-house HR generalist, or a generic consultant. Side by side, no spin.</p>
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
