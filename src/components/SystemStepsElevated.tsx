'use client';

interface Step {
  step: string;
  title: string;
  description: string;
}

interface SystemStepsElevatedProps {
  steps: Step[];
}

export default function SystemStepsElevated({ steps }: SystemStepsElevatedProps) {
  return (
    <section
      className="relative overflow-hidden section-padding"
      style={{
        background: '#FFFFFF',
      }}
    >
      <div className="container-wide">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--brand-gold)' }}>
            The process
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-playfair)',
              fontSize: 'clamp(2rem, 4vw, 3.5rem)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#0D1535',
            }}
          >
            How we build your system
          </h2>
        </div>

        {/* Steps grid with diagonal connectors */}
        <div className="grid lg:grid-cols-5 gap-6 relative">
          {/* Diagonal connectors SVG — only visible on desktop */}
          <svg
            className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none"
            style={{ top: '120px' }}
          >
            {steps.map((_, i) => {
              if (i < steps.length - 1) {
                return (
                  <line
                    key={`line-${i}`}
                    x1={`${((i + 1) * 20)}%`}
                    y1="0"
                    x2={`${((i + 2) * 20)}%`}
                    y2="0"
                    stroke="var(--brand-gold)"
                    strokeWidth="2"
                    opacity="0.3"
                  />
                );
              }
              return null;
            })}
          </svg>

          {/* Step cards */}
          {steps.map((s, i) => (
            <div
              key={i}
              className="relative"
              style={{
                animation: `fadeInUp 0.6s ease-out ${0.1 + i * 0.1}s forwards`,
                opacity: 0,
              }}
            >
              {/* Card with gold accent border */}
              <div
                className="rounded-[16px] p-8 h-full relative"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E8D5B7',
                  boxShadow: '0 4px 20px rgba(13,21,53,0.06)',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-8px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(13,21,53,0.12)';
                  const topLine = e.currentTarget.querySelector('[data-accent-line]') as HTMLElement;
                  if (topLine) {
                    topLine.style.width = '100%';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(13,21,53,0.06)';
                  const topLine = e.currentTarget.querySelector('[data-accent-line]') as HTMLElement;
                  if (topLine) {
                    topLine.style.width = '0';
                  }
                }}
              >
                {/* Accent line top */}
                <div
                  data-accent-line
                  className="absolute top-0 left-0 h-1 transition-all duration-300"
                  style={{
                    background: 'var(--brand-gold)',
                    borderRadius: '16px 0 0 0',
                    width: '0',
                  }}
                />

                {/* Step number */}
                <div
                  className="text-5xl font-bold mb-4"
                  style={{
                    background: 'linear-gradient(135deg, #D4AF37 0%, #E8CA7E 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {s.step}
                </div>

                {/* Title */}
                <h3
                  style={{
                    fontFamily: 'var(--font-playfair)',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                    color: '#0D1535',
                    marginBottom: '12px',
                  }}
                >
                  {s.title}
                </h3>

                {/* Description */}
                <p className="text-sm leading-relaxed" style={{ color: '#44506A' }}>
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
