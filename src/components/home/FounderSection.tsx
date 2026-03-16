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

          {/* Left — visual block */}
          <div className="relative">
            {/* Background card */}
            <div
              className="relative rounded-[24px] overflow-hidden p-10"
              style={{
                background: 'var(--brand-navy)',
                minHeight: '440px',
              }}
            >
              {/* Glow */}
              <div
                className="absolute top-0 right-0 w-64 h-64 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(143,114,246,0.2) 0%, transparent 60%)' }}
              />

              {/* Quote icon */}
              <div
                className="w-12 h-12 rounded-[12px] flex items-center justify-center mb-8"
                style={{ background: 'rgba(143,114,246,0.15)', border: '1px solid rgba(143,114,246,0.25)' }}
              >
                <Quote size={20} style={{ color: 'var(--brand-purple)' }} />
              </div>

              <blockquote
                className="font-display font-semibold text-white leading-relaxed mb-8"
                style={{ fontSize: 'clamp(1.1rem, 2vw, 1.4rem)', color: 'rgba(255,255,255,0.9)' }}
              >
                &ldquo;Most HR problems aren't HR problems — they're process gaps dressed up as people issues. We fix the process.&rdquo;
              </blockquote>

              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm text-white"
                  style={{ background: 'var(--gradient)' }}
                >
                  R
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Ravello HR</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Founder & Lead Consultant</p>
                </div>
              </div>

              {/* Credential pills at bottom */}
              <div className="flex flex-wrap gap-2 mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                {CREDENTIALS.map((c) => (
                  <span
                    key={c}
                    className="text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right — copy */}
          <div>
            <p className="eyebrow mb-5">Why Ravello HR</p>
            <h2
              className="font-display font-bold mb-6 leading-tight"
              style={{ fontSize: 'clamp(1.9rem, 3.5vw, 2.75rem)', color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              Senior expertise. No junior hand-offs.
            </h2>
            <span className="accent-line-lg mb-7" />

            <div className="space-y-5 mb-10">
              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Most consultancies give you a senior pitch, then hand the work to a junior. Ravello HR is different — you get one senior expert who knows your business from day one.
              </p>
              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Every engagement is built around a named system with clear deliverables. You always know exactly what you're getting — and when.
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
