'use client';
import type { FrictionLevel } from '@/lib/supabase/types';

interface Props {
  level: FrictionLevel | null | undefined;
  topRec?: string;
  size?: 'sm' | 'md';
}

const LEVEL_STYLES: Record<FrictionLevel, { dot: string; bg: string; text: string; label: string }> = {
  Low:      { dot: 'var(--success)', bg: 'rgba(22,163,74,0.10)',   text: 'var(--emerald)', label: 'Low' },
  Medium:   { dot: 'var(--amber)', bg: 'rgba(217,119,6,0.10)',   text: '#92400E', label: 'Medium' },
  High:     { dot: 'var(--danger)', bg: 'rgba(220,38,38,0.10)',   text: 'var(--rose)', label: 'High' },
  Critical: { dot: '#7F1D1D', bg: 'rgba(127,29,29,0.12)',   text: '#7F1D1D', label: 'Critical' },
  Unknown:  { dot: '#94A3B8', bg: 'rgba(148,163,184,0.10)', text: 'var(--slate)', label: '—' },
};

export default function FrictionAlert({ level, topRec, size = 'sm' }: Props) {
  const key    = level ?? 'Unknown';
  const style  = LEVEL_STYLES[key];
  const isSmall = size === 'sm';

  const badge = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap"
      style={{
        background: style.bg,
        color:      style.text,
        fontSize:   isSmall ? '11px' : '12px',
        padding:    isSmall ? '2px 8px' : '3px 10px',
      }}
    >
      <span
        className="rounded-full flex-shrink-0"
        style={{ width: isSmall ? 6 : 7, height: isSmall ? 6 : 7, background: style.dot }}
      />
      {style.label} Friction
    </span>
  );

  if (!topRec) return badge;

  return (
    <div className="relative group inline-block">
      {badge}
      <div
        className="absolute bottom-full left-0 mb-2 w-56 rounded-[10px] p-3 text-xs leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50"
        style={{ background: '#070B1D', color: 'rgba(255,255,255,0.8)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
      >
        {topRec}
      </div>
    </div>
  );
}
