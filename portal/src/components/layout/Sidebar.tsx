'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, BookOpen, Users,
  LifeBuoy, LogOut, Settings, Lock, X, CalendarDays,
  Eye, EyeOff, Pencil, Check,
  ArrowUp, ArrowDown, Trophy, ExternalLink, CreditCard,
} from 'lucide-react';
import { useMobileMenu } from './MobileMenuContext';
import { useUserPreferences } from './UserPreferences';
import { useLockedFeature } from './LockedFeature';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const COUNT_KEY: Record<string, string> = {
  '/protect': 'actions',
  '/support': 'tickets',
  '/hire':    'candidates',
};

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  flag: string | null;
  fixed: boolean;
  showWhenDisabled?: boolean;
  /** Roles allowed to see this item. Undefined = everyone. */
  requireRole?: string[];
}

/* All possible nav items: order/visibility controlled by user prefs */
const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',            label: 'Dashboard',            icon: LayoutDashboard, flag: null,                    fixed: true  },
  { href: '/hire',                 label: 'HIRE',                 icon: Briefcase,       flag: 'hiring',                fixed: false },
  { href: '/lead',                 label: 'LEAD',                 icon: BookOpen,        flag: 'lead',                  fixed: false },
  { href: '/protect',              label: 'PROTECT',              icon: Users,           flag: 'protect',               fixed: false },
  { href: '/athletes-to-industry', label: 'Athletes To Industry', icon: Trophy,          flag: 'athletes_to_industry',  fixed: false, showWhenDisabled: true },
  { href: '/calendar',             label: 'Calendar',             icon: CalendarDays,    flag: null,                    fixed: false },
  { href: '/support',              label: 'Support',              icon: LifeBuoy,        flag: 'support',               fixed: false },
  { href: '/billing',              label: 'Billing',              icon: CreditCard,      flag: null,                    fixed: false, requireRole: ['client_admin', 'tps_admin'] },
  { href: '/settings',             label: 'Settings',             icon: Settings,        flag: null,                    fixed: false },
];

const DEFAULT_ORDER = ALL_NAV_ITEMS.map(i => i.href);

interface Props {
  flags?:  Record<string, boolean>;
  counts?: Record<string, number>;
  companyId?: string;
  userId?: string;
  role?: string;
  /** Hide the Billing nav entry when the company has nothing billable. */
  showBilling?: boolean;
}

export default function Sidebar({ flags = {}, counts = {}, companyId, userId, role = '', showBilling = true }: Props) {
  const path = usePathname();
  const { isOpen, close } = useMobileMenu();
  const { prefs, updatePrefs } = useUserPreferences();
  const locked = useLockedFeature();
  const [editMode, setEditMode] = useState(false);
  // Counts are pre-computed in the layout SSR pass and refreshed on every
  // navigation by Next's data revalidation — no client-side fetch needed.

  // Build ordered, visible nav items
  const orderedItems = useMemo(() => {
    const order = prefs.sidebar_order?.length > 0 ? prefs.sidebar_order : DEFAULT_ORDER;
    const hidden = new Set(prefs.sidebar_hidden ?? []);

    // Role-gated items drop out entirely for users who don't qualify
    // (so an Editor's "Customise menu" view never even hints at Billing).
    // Billing also drops out for free-only clients (no paid flag, no
    // Stripe sub) so the surface stays clean.
    const allowed = ALL_NAV_ITEMS.filter(item => {
      if (item.requireRole && !item.requireRole.includes(role)) return false;
      if (item.href === '/billing' && !showBilling) return false;
      return true;
    });

    // Sort by user's saved order
    const sorted = [...allowed].sort((a, b) => {
      const ai = order.indexOf(a.href);
      const bi = order.indexOf(b.href);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return sorted.map(item => ({
      ...item,
      hidden: hidden.has(item.href),
      disabled: item.flag !== null && flags[item.flag] === false,
    }));
  }, [prefs, flags, role, showBilling]);

  // Show every nav item the user has either explicitly hidden via
  // their preferences AND every disabled (out-of-package) item — the
  // disabled ones render greyed-out with a lock icon and pop the
  // 'not in your package' modal on click. Was filtering disabled
  // items out except for ATI; that hid features the user might want
  // to upgrade to.
  const visibleItems = orderedItems.filter(i => !i.hidden);

  async function moveItem(href: string, direction: 'up' | 'down') {
    const currentOrder = orderedItems.map(i => i.href);
    const idx = currentOrder.indexOf(href);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? Math.max(0, idx - 1) : Math.min(currentOrder.length - 1, idx + 1);
    if (idx === newIdx) return;

    const updated = [...currentOrder];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    await updatePrefs({ sidebar_order: updated });
  }

  async function toggleVisibility(href: string) {
    const item = ALL_NAV_ITEMS.find(i => i.href === href);
    if (item?.fixed) return; // Can't hide Dashboard

    const hidden = new Set(prefs.sidebar_hidden ?? []);
    if (hidden.has(href)) hidden.delete(href);
    else hidden.add(href);
    await updatePrefs({ sidebar_hidden: Array.from(hidden) });
  }

  function renderNavItem(item: typeof orderedItems[number]) {
    const active = !item.disabled && !item.hidden && path.startsWith(item.href);
    const countKey = COUNT_KEY[item.href];
    const count = countKey ? (counts[countKey] ?? 0) : 0;

    // Disabled + showWhenDisabled: render greyed-out row with hover tooltip.
    if (item.disabled && item.showWhenDisabled && !editMode) {
      return (
        <div key={item.href} className="relative group/tooltip">
          <div
            className="nav-link flex-1 cursor-not-allowed"
            style={{ opacity: 0.45 }}
            aria-disabled="true"
          >
            <item.icon size={15} />
            <span className="flex-1">{item.label}</span>
            <Lock size={11} style={{ color: 'var(--ink-faint)' }} />
          </div>
          <div
            className="hidden group-hover/tooltip:block hover:block absolute left-full top-0 ml-2 w-64 rounded-[12px] p-3.5 z-50"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              boxShadow: '0 12px 32px rgba(7,11,29,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5"
               style={{ color: 'var(--purple)' }}>
              <Trophy size={10} className="inline mr-1 -mt-0.5" />
              Programme partner
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Proudly supporting the Athletes To Industry programme. Find out more here —
            </p>
            <a
              href="https://www.athletestoindustry.co.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
              style={{ color: 'var(--purple)' }}
            >
              athletestoindustry.co.uk <ExternalLink size={10} />
            </a>
          </div>
        </div>
      );
    }

    // Disabled (out-of-package) items still render — greyed-out with
    // a lock — and pop the polite 'not in your package' modal on
    // click rather than navigating. Was returning null which hid them
    // entirely. Skipped while in editMode so the user can still
    // re-order them in their preferences.
    if (item.disabled && !editMode) {
      return (
        <button
          key={item.href}
          type="button"
          onClick={() => locked.show(item.label)}
          className="nav-link flex-1 text-left w-full"
          style={{
            opacity: 0.45,
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
          }}
          aria-disabled="true"
          title={`${item.label} is not in your package`}
        >
          <item.icon size={15} />
          <span className="flex-1">{item.label}</span>
          <Lock size={11} style={{ color: 'var(--ink-faint)' }} />
        </button>
      );
    }

    return (
      <div key={item.href} className="flex items-center gap-0.5">
        {editMode && (
          <div className="flex flex-col flex-shrink-0">
            <button onClick={() => moveItem(item.href, 'up')} className="p-0.5 rounded hover:bg-[var(--surface-alt)]" style={{ color: 'var(--ink-faint)' }}>
              <ArrowUp size={10} />
            </button>
            <button onClick={() => moveItem(item.href, 'down')} className="p-0.5 rounded hover:bg-[var(--surface-alt)]" style={{ color: 'var(--ink-faint)' }}>
              <ArrowDown size={10} />
            </button>
          </div>
        )}

        {editMode ? (
          <div
            className="nav-link flex-1"
            style={{ opacity: item.hidden || item.disabled ? 0.35 : 1 }}
          >
            <item.icon size={15} />
            <span className="flex-1">{item.label}</span>
            {!item.fixed && (
              <button
                onClick={() => toggleVisibility(item.href)}
                className="p-1 rounded hover:bg-[var(--surface-alt)]"
                title={item.hidden ? 'Show' : 'Hide'}
              >
                {item.hidden
                  ? <EyeOff size={12} style={{ color: 'var(--ink-faint)' }} />
                  : <Eye size={12} style={{ color: 'var(--purple)' }} />}
              </button>
            )}
            {item.disabled && (
              <Lock size={11} style={{ color: 'var(--ink-faint)' }} />
            )}
          </div>
        ) : (
          <Link href={item.href} prefetch={false} className={`nav-link flex-1 ${active ? 'active' : ''}`}>
            <item.icon size={15} />
            <span>{item.label}</span>
            {count > 0 && (
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}>
                {count}
              </span>
            )}
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} onClick={close} aria-hidden="true" />

      <aside
        className={`sidebar-mobile fixed top-0 left-0 h-screen flex flex-col z-40 ${isOpen ? 'open' : ''}`}
        style={{ width: 'var(--sidebar-w)', background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <Link prefetch={false} href="/dashboard" className="flex items-center">
            <Image src={LOGO} alt="The People System" width={160} height={52} className="h-7 w-auto object-contain" sizes="160px" priority />
          </Link>
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-md hidden lg:inline" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}>Portal</span>
          <button onClick={close} className="lg:hidden ml-auto flex items-center justify-center w-7 h-7 rounded-md" style={{ color: 'var(--ink-faint)' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pt-3">
          <div className="space-y-0.5">
            {editMode
              ? orderedItems.map(renderNavItem)
              : visibleItems.map(renderNavItem)
            }
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 space-y-1" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            onClick={() => setEditMode(!editMode)}
            className="nav-link w-full text-left"
            style={{ color: editMode ? 'var(--purple)' : undefined }}
          >
            {editMode ? <Check size={14} /> : <Pencil size={14} />}
            <span>{editMode ? 'Done editing' : 'Customise menu'}</span>
          </button>
          <form action="/auth/signout" method="post">
            <button type="submit" className="nav-link w-full text-left">
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
