'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface ProductHeroElevatedProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText?: string;
  ctaHref?: string;
}

export default function ProductHeroElevated({
  eyebrow,
  title,
  subtitle,
  description,
  ctaText = 'Book a consultation',
  ctaHref = 'https://calendly.com/ravellohr/free-consultation',
}: ProductHeroElevatedProps) {
  return (
    <section
      className="relative overflow-hidden pt-20"
      style={{
        background: 'linear-gradient(180deg, #0D1535 0%, #1A2847 100%)',
        minHeight: 'fit-content',
        paddingBottom: '80px',
      }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(0deg, #D4AF37 1px, transparent 1px), linear-gradient(90deg, #D4AF37 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      <div className="relative z-10 container-narrow section-padding">
        <div className="space-y-8 max-w-2xl">

          {/* Eyebrow */}
          <div
            style={{
              animation: `slideInUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s forwards`,
              opacity: 0,
            }}
            className="flex items-center gap-2"
          >
            <div
              className="w-1 h-6"
              style={{
                background: 'var(--brand-gold)',
                transform: 'skewX(-15deg)',
              }}
            />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-gold)' }}>
              {eyebrow}
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: 'var(--font-playfair)',
              fontSize: 'clamp(2.8rem, 5vw, 4.5rem)',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              animation: `slideInUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s forwards`,
              opacity: 0,
            }}
          >
            {title}
          </h1>

          {/* Subtitle with gold accent */}
          <p
            className="text-2xl font-semibold leading-tight"
            style={{
              color: 'var(--brand-gold)',
              animation: `slideInUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s forwards`,
              opacity: 0,
            }}
          >
            {subtitle}
          </p>

          {/* Description */}
          <p
            className="text-lg leading-relaxed"
            style={{
              color: 'rgba(255,255,255,0.75)',
              animation: `fadeIn 0.8s ease-out 0.4s forwards`,
              opacity: 0,
            }}
          >
            {description}
          </p>

          {/* CTA */}
          <div
            style={{
              animation: `fadeIn 0.8s ease-out 0.5s forwards`,
              opacity: 0,
            }}
          >
            <Link
              href={ctaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-[12px] font-semibold text-white transition-all duration-200"
              style={{
                background: 'var(--brand-gold)',
                color: 'var(--brand-navy)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(212,175,55,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {ctaText} <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>

      <style>{`
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
