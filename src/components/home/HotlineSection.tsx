import Link from 'next/link';
import { ArrowRight, Phone } from 'lucide-react';

export default function HotlineSection() {
  return (
    <section className="section-padding bg-brand-deep relative overflow-hidden">
      <div className="absolute inset-0 cyber-grid opacity-20" />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(107,33,255,0.12) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 container-narrow text-center">
        <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 border border-brand-violet/30 font-mono text-xs text-brand-violet"
          style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
        >
          <Phone size={12} />
          No-Fluff HR Hotline
        </div>

        <h2 className="font-display text-4xl lg:text-6xl font-bold text-white mb-4">
          Book 15 mins.<br />
          <span className="text-gradient">Bring your mess.</span><br />
          Leave with clarity.
        </h2>

        <p className="text-white/40 text-lg mb-10 max-w-lg mx-auto">
          No pitch. No slides. One straight conversation about your people problem and what to do about it.
        </p>

        <Link href="/book" className="btn-primary text-base">
          Book the Hotline <ArrowRight size={18} />
        </Link>

        <p className="font-mono text-brand-slate text-xs mt-5 tracking-wider">// 15 minutes · Free · No obligation</p>
      </div>
    </section>
  );
}
