'use client';
import { useRef } from 'react';

const WINS = [
  { sector: 'Manufacturing firm',     win: 'Agency spend cut 44% in 8 months' },
  { sector: 'SME in Bristol',          win: '0 tribunal outcomes after full restructure' },
  { sector: 'Professional services',  win: 'Time-to-hire reduced by 6 weeks' },
  { sector: 'Tech scale-up',           win: 'Onboarding compliance score 100% first audit' },
  { sector: 'Healthcare provider',     win: 'TUPE transfer with 0 grievances raised' },
  { sector: 'Logistics business',      win: 'Agency dependency eliminated across 3 sites' },
  { sector: 'Financial services firm', win: 'Policy suite rebuilt in under 3 weeks' },
  { sector: 'Construction group',      win: 'M&A people risk identified, deal restructured' },
];

export default function SocialProofTicker() {
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative overflow-hidden py-3"
      style={{
        background: 'var(--brand-navy)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, var(--brand-navy), transparent)' }}
      />
      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, var(--brand-navy), transparent)' }}
      />

      <div
        ref={trackRef}
        className="flex items-center gap-0 whitespace-nowrap"
        style={{ animation: 'ticker 42s linear infinite' }}
      >
        {/* Duplicate for seamless loop */}
        {[...WINS, ...WINS].map((w, i) => (
          <div key={i} className="inline-flex items-center gap-3 px-8">
            <span
              className="inline-flex items-center justify-center w-[5px] h-[5px] rounded-full flex-shrink-0"
              style={{ background: 'var(--brand-purple)' }}
            />
            <span
              className="text-[11px] font-bold tracking-wide"
              style={{ color: 'rgba(255,255,255,0.38)' }}
            >
              {w.sector}
            </span>
            <span className="text-[11px] mx-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>·</span>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
              {w.win}
            </span>
            <span className="text-xs ml-4" style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
          </div>
        ))}
      </div>
    </div>
  );
}
