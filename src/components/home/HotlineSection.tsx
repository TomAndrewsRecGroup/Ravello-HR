import Link from 'next/link';
import Image from 'next/image';
import { CalendarCheck, ArrowRight, Mail } from 'lucide-react';

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
          className="text-lg leading-relaxed mb-4 max-w-[520px] mx-auto"
          style={{ color: 'var(--ink-soft)' }}
        >
          Thirty minutes with Lucy and Tom. No pitch. No slides. You describe the situation,
          we tell you exactly what the problem is and what to do about it.
        </p>

        <p
          className="text-sm leading-relaxed mb-10 max-w-[480px] mx-auto"
          style={{ color: 'var(--ink-faint)' }}
        >
          Most clients say this is the most useful 30 minutes they&rsquo;ve had on their people
          function. You leave with 1–3 specific next steps you can act on immediately —
          whether you work with us or not.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/book" className="btn-gradient">
            <CalendarCheck size={16} /> Book a Free 30-min Call
          </Link>
          <a href="mailto:info@thepeoplesystem.co.uk?subject=I'd like to talk about my people function" className="btn-secondary">
            <Mail size={14} /> Email Us Directly
          </a>
        </div>

        <p className="mt-8 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          Free · No obligation · We typically respond within 4 hours ·{' '}
          <a
            href="mailto:info@thepeoplesystem.co.uk"
            className="underline hover:no-underline"
            style={{ color: 'var(--brand-purple)' }}
          >
            info@thepeoplesystem.co.uk
          </a>
        </p>
      </div>
    </section>
  );
}
