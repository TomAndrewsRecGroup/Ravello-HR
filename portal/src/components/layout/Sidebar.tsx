'use client';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, BookOpen, Users,
  LifeBuoy, LogOut, Settings, Lock, X, CalendarDays,
  GripVertical, Eye, EyeOff, Pencil, Check,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { useMobileMenu } from './MobileMenuContext';
import { useUserPreferences } from './UserPreferences';
import { createClient } from '@/lib/supabase/client';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const COUNT_KEY: Record<string, string> = {
  '/protect': 'actions',
  '/support': 'tickets',
  '/hire':    'candidates',
};

/* All possible nav items — order/visibility controlled by user prefs */
const ALL_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, flag: null,      fixed: true },
  { href: '/hire',      label: 'HIRE',      icon: Briefcase,       flag: 'hiring',  fixed: false },
  { href: '/lead',      label: 'LEAD',      icon: BookOpen,        flag: 'lead',    fixed: false },
  { href: '/protect',   label: 'PROTECT',   icon: Users,           flag: 'protect', fixed: false },
  { href: '/calendar',  label: 'Calendar',  icon: CalendarDays,    flag: null,      fixed: false },
  { href: '/support',   label: 'Support',   icon: LifeBuoy,        flag: 'support', fixed: false },
  { href: '/settings',  label: 'Settings',  icon: Settings,        flag: null,      fixed: false },
];

const DEFAULT_ORDER = ALL_NAV_ITEMS.map(i => i.href);

interface Props {
  flags?:  Record<string, boolean>;
  counts?: Record<string, number>;
  companyId?: string;
  userId?: string;
}

export default function Sidebar({ flags = {}, counts: initialCounts = {}, companyId, userId }: Props) {
  const path = usePathname();
  const { isOpen, close } = useMobileMenu();
  const { prefs, updatePrefs } = useUserPreferences();
  const [editMode, setEditMode] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);

  // Fetch badge counts client-side (non-blocking — page renders immediately)
  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    const now = new Date().toISOString();

    Promise.all([
      supabase.from('actions').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'active')
        .or(`dismiss_until.is.null,dismiss_until.lt.${now}`),
      supabase.from('tickets').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).in('status', ['open', 'in_progress']),
      supabase.from('candidates').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('approved_for_client', true).eq('client_status', 'pending'),
    ]).then(([actRes, tickRes, candRes]) => {
      setCounts({
        actions: actRes.count ?? 0,
        tickets: tickRes.count ?? 0,
        candidates: candRes.count ?? 0,
      });
    }).catch(() => {});
  }, [companyId, path]); // re-fetch when navigating

  // Build ordered, visible nav items
  const orderedItems = useMemo(() => {
    const order = prefs.sidebar_order?.length > 0 ? prefs.sidebar_order : DEFAULT_ORDER;
    const hidden = new Set(prefs.sidebar_hidden ?? []);

    // Sort ALL_NAV_ITEMS by user's saved order
    const sorted = [...ALL_NAV_ITEMS].sort((a, b) => {
      const ai = order.indexOf(a.href);
      const bi = order.indexOf(b.href);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return sorted.map(item => ({
      ...item,
      hidden: hidden.has(item.href),
      disabled: item.flag !== null && flags[item.flag] === false,
    }));
  }, [prefs, flags]);

  const visibleItems = orderedItems.filter(i => !i.hidden && !i.disabled);

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

    if (item.disabled && !editMode) return null;

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
          <Link href={item.href} className={`nav-link flex-1 ${active ? 'active' : ''}`}>
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
          <Link href="/dashboard" className="flex items-center">
            <Image src={LOGO} alt="The People System" width={160} height={52} className="h-7 w-auto object-contain" priority />
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
