import Link from 'next/link';
import { CalendarCheck, ArrowRight } from 'lucide-react';

export default function HotlineSection() {
  return (
    <section
      className="section-padding relative overflow-hidden"
      style={{ background: 'var(--surface-alt)' }}
    >
      {/* Data grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(124,58,237,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.03) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(124,58,237,0.09) 0%, rgba(59,111,255,0.05) 40%, transparent 68%)',
        }}
      />

      <div className="relative z-10 container-narrow text-center">
        <p className="eyebrow justify-center mb-6">
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: 'var(--brand-purple)' }}
          />
          Ready to start?
        </p>

        <h2 className="section-title mb-6">
          Let&apos;s talk about your<br />
          <span className="text-gradient">biggest people challenge.</span>
        </h2>

        <p
          className="text-lg leading-relaxed mb-10 max-w-[500px] mx-auto"
          style={{ color: 'var(--ink-soft)' }}
        >
          No pitch. No hard sell. A 30-minute call to understand your situation
          and tell you honestly whether we can help.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/book" className="btn-gradient">
            <CalendarCheck size={16} /> Book a Free Call
          </Link>
          <Link href="/tools/hiring-score" className="btn-secondary">
            Try the Hiring Score first <ArrowRight size={14} />
          </Link>
        </div>

        <p className="mt-8 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          Free 30-min virtual meeting · No obligation · Typically responds within 4 hours
        </p>
      </div>
    </section>
  );
}
