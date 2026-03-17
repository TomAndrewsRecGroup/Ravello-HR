import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const proof = [
  'HR support on demand — no retainers',
  'Hiring via a network of vetted recruiters',
  'Client portal: visibility across all your people activity',
];

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Background glows */}
      <div
        className="absolute right-0 top-0 w-[800px] h-[800px] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 80% 20%, rgba(143,114,246,0.1) 0%, rgba(147,184,255,0.07) 40%, transparent 70%)',
        }}
      />
      <div
        className="absolute left-0 bottom-0 w-[600px] h-[600px] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 10% 90%, rgba(232,182,217,0.07) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 container-wide section-padding w-full">
        <div className="grid lg:grid-cols-[1fr_460px] gap-16 xl:gap-28 items-center">

          {/* Left — copy */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="eyebrow">Ravello</span>
              <span className="w-8 h-px" style={{ background: 'var(--gradient)' }} />
              <span
                className="text-xs font-medium uppercase tracking-[0.15em]"
                style={{ color: 'var(--ink-faint)' }}
              >
                HR &amp; Hiring for Growing Businesses
              </span>
            </div>

            <h1 className="display-xl font-display mb-6" style={{ color: 'var(--ink)' }}>
              You don&apos;t need a full HR team.{' '}
              <span className="text-gradient">You need Ravello.</span>
            </h1>

            <p
              className="text-lg leading-relaxed mb-3 max-w-[540px]"
              style={{ color: 'var(--ink-soft)' }}
            >
              Ravello gives businesses of 10–250 people the HR support, structured hiring, and
              operational visibility they need — without the overhead of building it in-house.
            </p>
            <p
              className="text-base leading-relaxed mb-10 max-w-[500px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              One platform. Expert support. A recruiter network that works for you.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <Link href="/contact" className="btn-cta">
                Talk to Ravello <ArrowRight size={16} />
              </Link>
              <Link href="/how-it-works" className="btn-secondary">
                How it works
              </Link>
            </div>

            <ul className="space-y-3">
              {proof.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--brand-purple)' }} />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — visual system diagram */}
          <div className="hidden lg:block relative">
            {/* Outer glow ring */}
            <div
              className="absolute inset-0 rounded-[28px] pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 50% 40%, rgba(143,114,246,0.08) 0%, transparent 70%)',
                border: '1px solid rgba(143,114,246,0.1)',
              }}
            />

            <div
              className="relative rounded-[28px] p-8 overflow-hidden"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--brand-line)',
                boxShadow: '0 4px 40px rgba(14,22,51,0.09)',
              }}
            >
              {/* Header chip */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
                  Ravello Client Portal
                </span>
              </div>

              {/* Mock portal rows */}
              {[
                { label: 'Hiring Activity',  val: '3 active roles',      dot: 'var(--brand-purple)', badge: 'In Progress' },
                { label: 'HR Support',       val: '1 open request',      dot: 'var(--brand-blue)',   badge: 'Active' },
                { label: 'Documents',        val: '12 docs stored',      dot: 'var(--brand-pink)',   badge: 'Up to date' },
                { label: 'Compliance',       val: 'Next review in 14d',  dot: 'var(--brand-teal)',   badge: 'On track' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between px-4 py-3 rounded-[12px] mb-2"
                  style={{ background: 'var(--surface-alt)', border: '1px solid var(--brand-line)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: row.dot }}
                    />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{row.label}</p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{row.val}</p>
                    </div>
                  </div>
                  <span className="pill-purple text-[10px]">{row.badge}</span>
                </div>
              ))}

              {/* Shortlist ready banner */}
              <div
                className="mt-4 rounded-[12px] px-4 py-3 flex items-center gap-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(143,114,246,0.12) 0%, rgba(147,184,255,0.1) 100%)',
                  border: '1px solid rgba(143,114,246,0.15)',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(143,114,246,0.15)' }}
                >
                  <span className="text-sm">✓</span>
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                    Shortlist ready — Senior Finance Manager
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                    3 candidates to review
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
