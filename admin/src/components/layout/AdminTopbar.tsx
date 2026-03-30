'use client';
import { Search } from 'lucide-react';
import NotificationBell from '@/components/modules/NotificationBell';

interface Props { title: string; subtitle?: string; actions?: React.ReactNode; }

export default function AdminTopbar({ title, subtitle, actions }: Props) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 lg:px-8"
      style={{
        height: 'var(--topbar-h)',
        background: 'rgba(250,250,248,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Gradient bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.12), rgba(59,111,255,0.08), transparent)',
        }}
      />
      <div>
        <h1
          className="font-display text-[1.15rem]"
          style={{
            color: 'var(--ink)',
            fontWeight: 300,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button className="btn-icon" title="Search">
          <Search size={15} />
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}
