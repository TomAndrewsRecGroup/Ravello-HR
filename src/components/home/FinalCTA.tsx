import Link from 'next/link';
import { ArrowRight, Calendar, Mail } from 'lucide-react';

export default function FinalCTA() {
  return (
    <section className="section-padding section-alt">
      <div className="container-mid text-center">

        <div
          className="rounded-[28px] px-10 py-16 relative overflow-hidden"
          style={{
            background: 'var(--brand-navy)',
            boxShadow: '0 8px 60px rgba(14,22,51,0.2)',
          }}
        >
          {/* Glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(143,114,246,0.25) 0%, rgba(147,184,255,0.1) 40%, transparent 70%)',
            }}
          />

          <div className="relative z-10">
            <p className="eyebrow-light mb-4">Get started</p>
            <h2 className="display-lg text-white mb-5">
              Ready to take control of<br className="hidden sm:block" /> hiring and HR?
            </h2>
            <p className="text-base leading-relaxed mb-10 max-w-[480px] mx-auto" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Book a free consultation and we&apos;ll map out what Ravello looks like for your business — no
              pitch, no obligation. Just a clear picture of what&apos;s possible.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/contact" className="btn-cta">
                <Calendar size={16} />
                Book a Free Consultation
                <ArrowRight size={15} />
              </Link>
              <Link href="/contact#submit-role" className="btn-outline-light">
                <Mail size={16} />
                Submit a Role
              </Link>
            </div>

            <p className="mt-6 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              No obligation &nbsp;·&nbsp; Response within one business day &nbsp;·&nbsp; UK-based team
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
