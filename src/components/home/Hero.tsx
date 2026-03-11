import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Soft radial glows */}
      <div className="absolute right-0 top-0 w-[700px] h-[700px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 30%, rgba(143,114,246,0.1) 0%, rgba(147,184,255,0.07) 40%, transparent 70%)' }}
      />
      <div className="absolute left-0 bottom-0 w-[500px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(232,182,217,0.08) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 container-wide section-padding w-full">
        <div className="grid lg:grid-cols-[1fr_440px] gap-16 xl:gap-24 items-center">

          {/* Left — copy */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="eyebrow">Ravello HR</span>
              <span className="w-8 h-px" style={{ background: 'var(--gradient)' }} />
              <span className="text-xs font-medium uppercase tracking-[0.15em]" style={{ color: 'var(--ink-faint)' }}>UK People Consultancy</span>
            </div>

            <h1
              className="font-display font-bold mb-6 leading-[1.04] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(2.8rem, 6vw, 4.75rem)', color: 'var(--ink)' }}
            >
              The HR expertise your business{' '}
              <span className="text-gradient">actually needs.</span>
            </h1>

            <p className="text-lg leading-relaxed mb-3 max-w-[520px]" style={{ color: 'var(--ink-soft)' }}>
              Three named systems. One senior expert. No generic consultancy.
            </p>
            <p className="text-base leading-relaxed mb-10 max-w-[480px]" style={{ color: 'var(--ink-faint)' }}>
              Ravello HR fixes the hiring, compliance and transformation challenges that slow ambitious businesses down — permanently.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/book" className="btn-primary">
                Book a Free Call <ArrowRight size={16} />
              </Link>
              <Link href="/tools/hiring-score" className="btn-secondary">
                Get Your Hiring Score
              </Link>
            </div>

            {/* Micro metrics */}
            <div className="flex flex-wrap items-center gap-8 mt-10 pt-8"
              style={{ borderTop: '1px solid var(--brand-line)' }}
            >
              {[
                { val: '10+',  lab: 'Years experience' },
                { val: '40%+', lab: 'Agency cost reduction' },
                { val: '0',    lab: 'Tribunal outcomes' },
              ].map((m) => (
                <div key={m.lab}>
                  <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{m.val}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{m.lab}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — logo composition */}
          <div className="hidden lg:flex items-center justify-center relative">
            {/* Outer ring */}
            <div className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(143,114,246,0.07) 0%, transparent 70%)',
                border: '1px solid rgba(143,114,246,0.1)',
              }}
            />
            {/* Inner ring */}
            <div className="absolute w-[290px] h-[290px] rounded-full pointer-events-none"
              style={{ border: '1px solid rgba(147,184,255,0.12)' }}
            />

            {/* Logo mark centred */}
            <div className="relative z-10">
              <Image
                src={LOGO}
                alt="Ravello HR"
                width={280}
                height={120}
                className="object-contain"
                priority
              />
            </div>

            {/* Floating system pills */}
            {[
              { label: 'Smart Hiring System™', top: '6%',  left: '-5%',  dot: 'var(--brand-purple)' },
              { label: 'PolicySafe™',           top: '42%', right: '-8%', dot: 'var(--brand-blue)' },
              { label: 'DealReady People™',     top: '74%', left: '-2%',  dot: 'var(--brand-pink)' },
            ].map((p) => (
              <div
                key={p.label}
                className="absolute flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold bg-white"
                style={{
                  top: p.top,
                  left: (p as any).left,
                  right: (p as any).right,
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 2px 16px rgba(14,22,51,0.08)',
                  color: 'var(--ink)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.dot }} />
                {p.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
