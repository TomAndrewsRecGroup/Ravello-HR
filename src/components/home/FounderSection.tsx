import Link from 'next/link';
import { Linkedin, Award } from 'lucide-react';

export default function FounderSection() {
  return (
    <section className="section-padding gradient-hero text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-teal/10 rounded-full blur-3xl" />

      <div className="container-wide relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div>
            <p className="text-brand-gold text-sm font-semibold uppercase tracking-widest mb-4">
              The Expert Behind the System
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-6">
              Lucinda Reader
            </h2>
            <p className="text-white/80 text-lg leading-relaxed mb-6">
              15+ years of senior HR leadership across FTSE companies, private equity-backed businesses, NHS organisations, and high-growth start-ups.
              Lucinda has seen every hiring failure pattern, every compliance gap, every acquisition that went sideways on people.
            </p>
            <p className="text-white/70 leading-relaxed mb-8">
              The Smart Hiring System, PolicySafe™, and DealReady People™ are the distillation of that experience into a repeatable framework — so you don’t have to learn these lessons the hard way.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              {[
                'FTSE 250 experience',
                'Private Equity',
                'M&A integration',
                'Global organisations',
                'Start-up to scale-up',
                'NHS & public sector',
              ].map((tag) => (
                <span key={tag} className="bg-white/10 border border-white/20 text-white/80 text-xs font-medium px-3 py-1.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex gap-4">
              <Link href="/about" className="btn-gold">
                View Proof Page
              </Link>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline border-white/40 text-white hover:bg-white hover:text-brand-navy"
              >
                <Linkedin size={16} /> Connect on LinkedIn
              </a>
            </div>
          </div>

          {/* Credentials card */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-brand-teal/40 border-2 border-brand-teal/60 flex items-center justify-center">
                <span className="text-white font-bold">LR</span>
              </div>
              <div>
                <p className="font-semibold text-white">Lucinda Reader</p>
                <p className="text-white/60 text-sm">Founder & Principal Consultant</p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Hiring systems built', value: '30+' },
                { label: 'Sectors covered', value: '12+' },
                { label: 'Years at senior level', value: '15+' },
                { label: 'Acquisitions supported', value: '8+' },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className="text-white/70 text-sm">{m.label}</span>
                  <span className="font-bold text-white text-lg">{m.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-start gap-2 bg-brand-gold/20 border border-brand-gold/30 rounded-lg p-3">
              <Award size={16} className="text-brand-gold flex-shrink-0 mt-0.5" />
              <p className="text-white/90 text-xs">
                Worked with organisations you’d recognise — from blue chip to VC-backed growth businesses.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
