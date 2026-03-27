import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

const CREDENTIALS = [
  'Lucy: 18+ years senior HR and People leadership',
  'Tom: 10+ years in Talent and Recruitment',
  'CIPD qualified — Lucy',
  'Friction Lens technology by IvyLens Technology',
  'TUPE and restructure specialist — Lucy',
  '0 tribunal outcomes across all restructure work',
];

export default function FounderSection() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
      <div className="container-wide">
        <div className="grid lg:grid-cols-2 gap-16 xl:gap-24 items-center">

          {/* Left — quote card (dark, navy) */}
          <div
            className="relative rounded-[28px] overflow-hidden p-10"
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
              className="relative z-10 leading-relaxed mb-8"
              style={{
                fontSize: 'clamp(1.3rem, 2.2vw, 1.7rem)',
                fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                fontWeight: 300,
                fontStyle: 'italic',
                color: 'rgba(255,255,255,0.90)',
                letterSpacing: '-0.015em',
                lineHeight: 1.3,
              }}
            >
              &ldquo;Not HR with a bit of recruitment. Not recruitment pretending to do HR.
              A proper blend. One partner who can do all of it.&rdquo;
            </blockquote>

            {/* Attribution */}
            <div className="relative z-10 flex items-center gap-3 mb-8">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                style={{ background: 'var(--gradient)' }}
              >
                TPO
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Lucy &amp; Tom</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Co-founders, The People System
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
              Why The People System
            </p>
            <h2 className="section-title mb-5">
              Two specialists.<br />One partner. No handoffs.
            </h2>
            <span className="accent-line-lg mb-8" style={{ display: 'block' }} />
            <div className="space-y-5 mb-10">
              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Lucy brings 18+ years of senior HR and People leadership. Tom brings 10+ years
                in Talent and Recruitment, plus access to Friction Lens — the role scoring
                technology developed by IvyLens Technology. You get both — on your account, from day one.
              </p>
              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                No junior handoffs. No vague advice. Fixed scope, clear deliverables, and a
                partner who understands the commercial reality of building a business.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/about" className="btn-primary">
                About The People System <ArrowRight size={15} />
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
