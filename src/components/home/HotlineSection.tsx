import Link from 'next/link';
import Image from 'next/image';
import { CalendarCheck, ArrowRight } from 'lucide-react';

export default function HotlineSection() {
  return (
    <section
      className="section-padding relative overflow-hidden"
      style={{ background: 'var(--surface-alt)' }}
    >
      {/* Full-bleed editorial photo */}
      <Image
        src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&h=800&fit=crop"
        alt="Modern professional workspace"
        fill
        className="object-cover"
        style={{ opacity: 0.14 }}
      />

      {/* Gradient overlay — keeps text legible */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, rgba(124,58,237,0.12) 0%, rgba(59,111,255,0.06) 40%, transparent 70%)',
        }}
      />

      <div className="relative z-10 container-narrow text-center">
        <p className="eyebrow justify-center mb-6">
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: 'var(--brand-purple)' }}
          />
          Let&rsquo;s talk
        </p>

        <h2 className="section-title mb-6">
          One conversation.<br />
          <span className="text-gradient">A clear plan.</span>
        </h2>

        <p
          className="text-lg leading-relaxed mb-10 max-w-[500px] mx-auto"
          style={{ color: 'var(--ink-soft)' }}
        >
          Thirty minutes with Lucy and Tom. No pitch. A straight answer on where to start
          and what it would take to fix it.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/book" className="btn-gradient">
            <CalendarCheck size={16} /> Book a Free Call
          </Link>
          <Link href="/smart-hiring-system" className="btn-secondary">
            Start with HIRE <ArrowRight size={14} />
          </Link>
        </div>

        <p className="mt-8 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          Free 30-minute virtual call · No obligation · We typically respond within 4 hours
        </p>
      </div>
    </section>
  );
}
