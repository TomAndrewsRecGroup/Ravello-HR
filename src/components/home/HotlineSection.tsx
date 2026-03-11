import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function HotlineSection() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
      <div className="container-narrow text-center">
        <p className="eyebrow mb-5">No-Fluff HR Hotline</p>
        <h2 className="font-display font-bold mb-5 leading-tight"
          style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', color: 'var(--ink)', letterSpacing: '-0.02em' }}
        >
          Book 15 minutes.<br />
          Leave with clarity.
        </h2>
        <p className="text-base leading-relaxed mb-8 max-w-[440px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
          One straight conversation about your people problem and what to do about it. No pitch. No slides.
        </p>
        <Link href="/book" className="btn-primary inline-flex">
          Book the Hotline <ArrowRight size={16} />
        </Link>
        <p className="text-xs mt-4" style={{ color: 'var(--ink-faint)' }}>15 minutes · Free · No obligation</p>
      </div>
    </section>
  );
}
