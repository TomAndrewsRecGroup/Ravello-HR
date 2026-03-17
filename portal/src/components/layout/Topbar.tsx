'use client';
import { Bell, Search } from 'lucide-react';

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
        background: 'rgba(244,245,249,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div>
        <h1 className="font-display font-bold text-[1.05rem]" style={{ color: 'var(--ink)' }}>
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
        <button className="btn-icon relative" aria-label="Notifications">
          <Bell size={15} />
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--purple)' }}
          />
        </button>
      </div>
    </header>
  );
}
