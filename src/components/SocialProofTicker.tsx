'use client';
import { useEffect, useRef } from 'react';

const WINS = [
  { sector: 'Manufacturing firm',      win: 'Agency spend cut 44% in 8 months' },
  { sector: 'SME in Bristol',           win: '0 tribunal outcomes after full restructure' },
  { sector: 'Professional services',   win: 'Time-to-hire reduced by 6 weeks' },
  { sector: 'Tech scale-up',            win: 'Onboarding compliance score 100% first audit' },
  { sector: 'Healthcare provider',      win: 'TUPE transfer — 0 grievances raised' },
  { sector: 'Logistics business',       win: 'Agency dependency eliminated across 3 sites' },
  { sector: 'Financial services firm',  win: 'Policy suite rebuilt in under 3 weeks' },
  { sector: 'Construction group',       win: 'M&A people risk identified — deal restructured' },
];

export default function SocialProofTicker() {
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative overflow-hidden py-3.5"
      style={{ background: 'var(--brand-navy)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, var(--brand-navy), transparent)' }} />
      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, var(--brand-navy), transparent)' }} />

      <div
        ref={trackRef}
        className="flex items-center gap-0 whitespace-nowrap"
        style={{ animation: 'ticker 40s linear infinite' }}
      >
        {/* Duplicate for seamless loop */}
        {[...WINS, ...WINS].map((w, i) => (
          <div key={i} className="inline-flex items-center gap-2.5 px-8">
            <span
              className="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--brand-purple)' }}
            />
            <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {w.sector}:
            </span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {w.win}
            </span>
            <span className="text-xs ml-6" style={{ color: 'rgba(255,255,255,0.15)' }}>•</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
