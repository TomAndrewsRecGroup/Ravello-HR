import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

const CREDENTIALS = [
  '10+ years senior in-house HR',
  'CIPD qualified practitioner',
  'TUPE & restructure specialist',
  'M&A people due diligence',
];

export default function FounderSection() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
      <div className="container-wide">
        <div className="grid lg:grid-cols-2 gap-16 xl:gap-24 items-center">

          {/* Left — quote card (dark, navy) */}
          <div
            className="relative rounded-[28px] overflow-hidden p-10 scan-lines"
            style={{ background: 'var(--brand-navy)', minHeight: '440px' }}
          >
            {/* Gradient top bar */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: 'var(--gradient)' }}
            />

            {/* Ambient glow */}
            <div
              className="absolute top-0 right-0 w-72 h-72 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 80% 20%, rgba(124,58,237,0.22) 0%, transparent 60%)',
              }}
            />

            {/* Quote icon */}
            <div
              className="relative z-10 w-12 h-12 rounded-[14px] flex items-center justify-center mb-8"
              style={{
                background: 'rgba(124,58,237,0.16)',
                border: '1px solid rgba(124,58,237,0.28)',
              }}
            >
              <Quote size={20} style={{ color: '#A67DFF' }} />
            </div>

            <blockquote
              className="relative z-10 font-semibold text-white leading-relaxed mb-8"
              style={{ fontSize: 'clamp(1.1rem, 2vw, 1.4rem)', color: 'rgba(255,255,255,0.92)' }}
            >
              &ldquo;Most HR problems aren&apos;t HR problems — they&apos;re process gaps dressed up as people issues.
              We fix the process.&rdquo;
            </blockquote>

            {/* Attribution */}
            <div className="relative z-10 flex items-center gap-3 mb-8">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                style={{ background: 'var(--gradient)' }}
              >
                R
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Ravello HR</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Founder &amp; Lead Consultant
                </p>
              </div>
            </div>

            {/* Gold credential tags — quality signals */}
            <div
              className="relative z-10 flex flex-wrap gap-2 pt-6"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
            >
              {CREDENTIALS.map((c) => (
                <span
                  key={c}
                  className="text-[11px] px-3 py-1.5 rounded-full font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    color: 'rgba(255,255,255,0.55)',
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Right — copy */}
          <div>
            <p className="eyebrow mb-5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
              />
              Why Ravello HR
            </p>
            <h2 className="section-title mb-5">
              Senior expertise.<br />No junior hand-offs.
            </h2>
            <span className="accent-line-lg mb-8" style={{ display: 'block' }} />
            <div className="space-y-5 mb-10">
              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Most consultancies give you a senior pitch, then hand the work to a junior.
                Ravello HR is different — you get one senior expert who knows your business
                from day one.
              </p>
              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Every engagement is built around a named system with clear deliverables.
                You always know exactly what you&apos;re getting — and when.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/about" className="btn-primary">
                About Ravello HR <ArrowRight size={15} />
              </Link>
              <Link href="/book" className="btn-secondary">
                Book a Free Call
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
