import Link from 'next/link';
import { CalendarCheck, ArrowRight } from 'lucide-react';

export default function HotlineSection() {
  return (
    <section className="section-padding relative overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Soft background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(143,114,246,0.07) 0%, rgba(147,184,255,0.04) 35%, transparent 65%)',
        }}
      />

      <div className="relative z-10 container-narrow text-center">

        {/* Eyebrow */}
        <p className="eyebrow mb-5">Ready to start?</p>

        <h2
          className="font-display font-bold mb-6 leading-tight"
          style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', color: 'var(--ink)', letterSpacing: '-0.025em' }}
        >
          Let's talk about your<br />
          <span className="text-gradient">biggest people challenge.</span>
        </h2>

        <p
          className="text-base leading-relaxed mb-10 max-w-[480px] mx-auto"
          style={{ color: 'var(--ink-soft)' }}
        >
          No pitch. No hard sell. A 30-minute call to understand your situation and tell you honestly whether we can help.
        </p>

        {/* CTA group */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/book" className="btn-gradient">
            <CalendarCheck size={16} />
            Book a Free Call
          </Link>
          <Link href="/tools/hiring-score" className="btn-secondary">
            Try the Hiring Score first <ArrowRight size={14} />
          </Link>
        </div>

        {/* Reassurance line */}
        <p className="mt-8 text-xs" style={{ color: 'var(--ink-faint)' }}>
          Free 30-min virtual meeting · No obligation · Typically responds within 4 hours
        </p>
      </div>
    </section>
  );
}
