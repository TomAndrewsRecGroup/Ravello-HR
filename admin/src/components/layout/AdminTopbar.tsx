'use client';
import { Menu } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ClientSwitcherDropdown } from './ClientSwitcher';
import { useMobileMenu } from './MobileMenuContext';

// Lazy: GlobalSearch, EnquiriesButton, NotificationBell are non-
// critical for first paint and each opens a Supabase realtime
// channel on mount. Loading them after hydration shaves them out
// of the initial JS bundle and keeps the topbar interactive faster.
const GlobalSearch    = dynamic(() => import('@/components/modules/GlobalSearch'),    { ssr: false });
const EnquiriesButton = dynamic(() => import('@/components/modules/EnquiriesButton'), { ssr: false });
const NotificationBell = dynamic(() => import('@/components/modules/NotificationBell'), { ssr: false });

interface Props { title: string; subtitle?: string; actions?: React.ReactNode; }

export default function AdminTopbar({ title, subtitle, actions }: Props) {
  const { toggle } = useMobileMenu();

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 topbar-responsive"
      style={{
        height: 'var(--topbar-h)',
        background: 'rgba(255,255,255,0.92)',
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
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger: mobile/tablet only */}
        <button
          onClick={toggle}
          className="hamburger-btn"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1
            className="font-display text-[1rem] sm:text-[1.15rem] truncate"
            style={{
              color: 'var(--ink)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs mt-0.5 truncate hide-mobile" style={{ color: 'var(--ink-faint)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <div className="hide-below-desktop"><ClientSwitcherDropdown /></div>
        {actions}
        <GlobalSearch />
        <EnquiriesButton />
        <NotificationBell />
      </div>
    </header>
  );
}
