'use client';
import { Search } from 'lucide-react';
import NotificationBell from '@/components/modules/NotificationBell';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 lg:px-8"
      style={{
        height: 'var(--topbar-h)',
        background: 'rgba(250,250,248,0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
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
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <button className="btn-icon" aria-label="Search">
          <Search size={15} />
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}
