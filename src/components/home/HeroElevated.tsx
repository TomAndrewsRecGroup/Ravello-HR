'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/Ravello%20HR-8VMlOBmWizWioaqRpHKw7BZoDcfrg1';

const STATS = [
  { val: '10+', lab: 'Years expertise' },
  { val: '40%+', lab: 'Cost reduction' },
  { val: '0', lab: 'Tribunal outcomes' },
];

export default function HeroElevated() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F5F5F5 50%, #0D1535 100%)',
        minHeight: '100vh',
      }}
    >
      {/* Grid background pattern — subtle */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(0deg, #D4AF37 1px, transparent 1px), linear-gradient(90deg, #D4AF37 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      <div className="relative z-10 container-wide section-padding w-full" style={{ paddingTop: '120px', paddingBottom: '80px' }}>
        <div className="grid lg:grid-cols-[1fr_480px] gap-16 xl:gap-20 items-start">

          {/* Left column — copy */}
          <div className="space-y-8">

            {/* Logo with entrance animation */}
            <div
              style={{
                animation: 'fadeInScale 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0s forwards',
                opacity: 0,
              }}
            >
              <Image
                src={LOGO_FULL}
                alt="Ravello HR"
                width={1280}
                height={440}
                className="object-contain w-auto"
                style={{ height: '48px', width: 'auto' }}
                priority
              />
            </div>

            {/* Headline with staggered word reveal */}
            <h1
              style={{
                fontFamily: 'var(--font-playfair)',
                fontSize: 'clamp(3.2rem, 6vw, 5.5rem)',
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: '#0F1320',
                marginBottom: 0,
              }}
              className="space-y-2"
            >
              {['Your people', 'problems cost', 'more than'].map((word, i) => (
                <div
                  key={i}
                  style={{
                    animation: `slideInUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.2 + i * 0.15}s forwards`,
                    opacity: 0,
                  }}
                >
                  {i === 2 ? (
                    <span className="relative inline-block">
                      {word}
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '-8px',
                          left: 0,
                          width: '100%',
                          height: '3px',
                          background: 'var(--brand-gold)',
                          transform: 'skewX(-15deg)',
                        }}
                      />
                    </span>
                  ) : (
                    word
                  )}
                </div>
              ))}
              <div
                style={{
                  animation: `slideInUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.65s forwards`,
                  opacity: 0,
                }}
              >
                <span
                  style={{
                    background: 'linear-gradient(135deg, #7B2FBE 0%, #D4AF37 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  you think.
                </span>
              </div>
            </h1>

            {/* Subtext — delayed entrance */}
            <div
              style={{
                animation: `fadeIn 0.8s ease-out 0.9s forwards`,
                opacity: 0,
              }}
              className="space-y-3 max-w-[550px]"
            >
              <p className="text-lg leading-relaxed font-medium" style={{ color: '#44506A' }}>
                Most businesses stall because hiring is inconsistent, leadership is stretched, and processes are unclear.
              </p>
              <p className="text-base leading-relaxed" style={{ color: '#8A95AA' }}>
                Ravello fixes that. Named systems. Not generic advice.
              </p>
            </div>

            {/* CTA buttons — staggered */}
            <div
              className="flex flex-col sm:flex-row gap-4 pt-6"
              style={{
                animation: `fadeIn 0.8s ease-out 1.1s forwards`,
                opacity: 0,
              }}
            >
              <Link href="/tools/hiring-score" className="btn-primary inline-flex">
                Get Your Hiring Score <ArrowRight size={16} />
              </Link>
              <Link href="https://calendly.com/ravellohr/free-consultation" target="_blank" rel="noopener noreferrer"
                className="btn-outline-white inline-flex"
              >
                Book a Call
              </Link>
            </div>
          </div>

          {/* Right column — stats card with diagonal layout */}
          <div
            className="relative"
            style={{
              animation: `slideInRight 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s forwards`,
              opacity: 0,
            }}
          >
            {/* Diagonal card background */}
            <div
              className="absolute inset-0 rounded-[20px]"
              style={{
                background: 'var(--brand-navy)',
                transform: 'skewY(-3deg)',
                filter: 'drop-shadow(0 20px 40px rgba(13,21,53,0.25))',
              }}
            />

            {/* Content */}
            <div className="relative p-8 lg:p-10 space-y-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Current State
                </p>
                <p className="text-xl font-semibold mt-2" style={{ color: '#D4AF37' }}>
                  Your Hiring Score
                </p>
              </div>

              {/* Score display */}
              <div className="space-y-4">
                <div className="text-center">
                  <div
                    className="text-6xl font-bold mb-2"
                    style={{
                      background: 'linear-gradient(135deg, #D4AF37 0%, #E8CA7E 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    56
                  </div>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    Most businesses overestimate how well their hiring process works.
                  </p>
                </div>

                {/* Divider line */}
                <div style={{ height: '1px', background: 'rgba(212,175,55,0.2)', margin: '16px 0' }} />

                {/* Key metrics */}
                <div className="space-y-3">
                  {STATS.map((stat, i) => (
                    <div key={i} className="flex items-baseline gap-3">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--brand-gold)' }}
                      />
                      <div>
                        <span className="font-bold text-lg" style={{ color: '#D4AF37' }}>{stat.val}</span>
                        <span className="text-sm ml-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{stat.lab}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <Link
                href="/tools/hiring-score"
                className="block text-center py-3.5 px-6 rounded-[12px] font-semibold text-sm transition-all duration-200"
                style={{
                  background: 'var(--brand-gold)',
                  color: 'var(--brand-navy)',
                  border: '1px solid var(--brand-gold)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--brand-navy)';
                  e.currentTarget.style.color = 'var(--brand-gold)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--brand-gold)';
                  e.currentTarget.style.color = 'var(--brand-navy)';
                }}
              >
                Calculate Your Score →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </section>
  );
}
