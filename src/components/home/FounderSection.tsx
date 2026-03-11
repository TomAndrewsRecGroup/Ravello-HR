import Link from 'next/link';
import { ArrowRight, CheckCircle } from 'lucide-react';

const credentials = [
  'FTSE-listed and PE-backed business experience',
  'Led hiring, compliance and M&A people work at scale',
  'Built systems now used across multi-site operations',
  'Zero tribunal outcomes across all structured work',
];

export default function FounderSection() {
  return (
    <section className="section-padding bg-brand-void relative overflow-hidden">
      {/* Glow */}
      <div className="absolute right-0 top-0 w-[500px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(224,64,251,0.08) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 container-wide">
        <div className="grid lg:grid-cols-2 gap-14 items-center">

          {/* Left */}
          <div>
            <p className="font-mono text-brand-pink text-xs uppercase tracking-widest mb-4">// The founder</p>
            <h2 className="font-display text-4xl lg:text-5xl font-bold text-white mb-6">
              Senior HR.<br />
              <span className="text-gradient">Without the overhead.</span>
            </h2>
            <div className="space-y-4 text-white/50 text-sm leading-relaxed mb-8">
              <p>
                Lucinda Reader spent over a decade leading HR inside large, complex organisations — through acquisitions, rapid growth, and the kind of people challenges textbooks don't cover.
              </p>
              <p>
                She built Ravello HR because she kept seeing the same problems: hiring that didn't stick, compliance built on hope, and transformation that lost the people it needed most.
              </p>
            </div>
            <ul className="space-y-3 mb-8">
              {credentials.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <CheckCircle className="text-brand-violet flex-shrink-0 mt-0.5" size={16} />
                  <span className="text-white/60 text-sm">{c}</span>
                </li>
              ))}
            </ul>
            <Link href="/about" className="btn-outline">
              Full founder story <ArrowRight size={16} />
            </Link>
          </div>

          {/* Right — terminal card */}
          <div className="bg-brand-panel border border-brand-violet/30 p-6"
            style={{ clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))' }}
          >
            {/* Terminal bar */}
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-brand-muted/30">
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <span className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="font-mono text-xs text-brand-slate ml-2">lucinda_reader.profile</span>
            </div>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex gap-3">
                <span className="text-brand-violet">$</span>
                <span className="text-white/40">role</span>
                <span className="text-brand-pink ml-auto">Founder, Ravello HR</span>
              </div>
              <div className="flex gap-3">
                <span className="text-brand-violet">$</span>
                <span className="text-white/40">experience</span>
                <span className="text-brand-cyan ml-auto">10+ years</span>
              </div>
              <div className="flex gap-3">
                <span className="text-brand-violet">$</span>
                <span className="text-white/40">sectors</span>
                <span className="text-white/70 ml-auto text-right text-xs">Retail · Tech · PE · MFG</span>
              </div>
              <div className="flex gap-3">
                <span className="text-brand-violet">$</span>
                <span className="text-white/40">tribunals</span>
                <span className="text-green-400 ml-auto">0</span>
              </div>
              <div className="flex gap-3">
                <span className="text-brand-violet">$</span>
                <span className="text-white/40">systems_built</span>
                <span className="text-brand-pink ml-auto">3 (named)</span>
              </div>
              <div className="border-t border-brand-muted/20 pt-3 mt-3">
                <span className="text-brand-violet">$ </span>
                <span className="text-white/40">availability </span>
                <span className="text-green-400 animate-pulse">● OPEN</span>
              </div>
            </div>
            <div className="mt-6">
              <Link href="/book" className="btn-primary w-full justify-center text-sm">
                Book a Free Call <ArrowRight size={15} />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
