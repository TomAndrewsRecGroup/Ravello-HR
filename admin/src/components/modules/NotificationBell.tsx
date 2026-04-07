'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Bell, Briefcase, LifeBuoy, ShieldCheck, Users,
  FileText, AlertTriangle, CheckCircle2, UserPlus, Radio,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  role_pending_approval: { icon: Briefcase,     color: 'var(--purple)' },
  role_filled:           { icon: CheckCircle2,  color: '#10B981' },
  ticket_created:        { icon: LifeBuoy,      color: '#D97706' },
  ticket_escalated:      { icon: AlertTriangle, color: '#DC2626' },
  compliance_overdue:    { icon: ShieldCheck,    color: '#DC2626' },
  compliance_due_soon:   { icon: ShieldCheck,    color: '#D97706' },
  document_uploaded:     { icon: FileText,       color: 'var(--blue)' },
  user_invited:          { icon: UserPlus,       color: '#14B8A6' },
  candidate_submitted:   { icon: Users,          color: 'var(--purple)' },
  broadcast:             { icon: Radio,          color: 'var(--blue)' },
  general:               { icon: Bell,           color: 'var(--ink-faint)' },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.general;
}

export default function NotificationBell() {
  const supabase = createClient();
  const router   = useRouter();
  const ref      = useRef<HTMLDivElement>(null);

  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [filter,        setFilter]        = useState<'all' | 'unread'>('all');

  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadNotifications();

    // Subscribe to realtime inserts instead of polling
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      if (!userIdRef.current) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) userIdRef.current = user.id;
      }
      if (!userIdRef.current) return;
      const userId = userIdRef.current;

      channel = supabase
        .channel('admin-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const newNotif = payload.new as Notification;
            setNotifications(prev => [newNotif, ...prev].slice(0, 30));
            setUnreadCount(prev => prev + 1);
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function loadNotifications() {
    // Cache user ID to avoid repeated auth calls
    if (!userIdRef.current) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userIdRef.current = user.id;
    }
    const userId = userIdRef.current;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      setNotifications(data);
      // Derive unread count from fetched data instead of separate query
      setUnreadCount(data.filter((n: any) => !n.read).length);
    }
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function clearAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications').delete().eq('user_id', user.id).eq('read', true);
    setNotifications(prev => prev.filter(n => !n.read));
  }

  function handleClick(n: Notification) {
    if (!n.read) markRead(n.id);
    if (n.link) {
      router.push(n.link);
      setOpen(false);
    }
  }

  function timeAgo(date: string): string {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    const d = Math.floor(s / 86400);
    if (d < 7) return `${d}d ago`;
    return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-icon relative"
        title="Notifications"
        onClick={() => setOpen(o => !o)}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{ background: 'var(--red)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-full sm:w-[380px] rounded-xl overflow-hidden shadow-xl z-50"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', animation: 'slideDown 0.15s ease' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Notifications</p>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(217,68,68,0.08)', color: '#B02020' }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] font-medium" style={{ color: 'var(--purple)' }}>
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 px-4 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
            {(['all', 'unread'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors"
                style={{
                  background: filter === f ? 'var(--surface-soft)' : 'transparent',
                  color: filter === f ? 'var(--ink)' : 'var(--ink-faint)',
                }}
              >
                {f === 'all' ? 'All' : `Unread (${unreadCount})`}
              </button>
            ))}
            {notifications.some(n => n.read) && (
              <button onClick={clearAll} className="text-[10px] font-medium ml-auto" style={{ color: 'var(--ink-faint)' }}>
                Clear read
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div className="max-h-[420px] overflow-y-auto">
            {displayed.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: 'var(--ink-faint)' }}>
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
            ) : (
              displayed.map(n => {
                const tc = getTypeConfig(n.type);
                const Icon = tc.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--surface-soft)] transition-colors flex gap-3"
                    style={{
                      borderBottom: '1px solid var(--line)',
                      background: n.read ? undefined : 'rgba(124,58,237,0.03)',
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${tc.color}12`, color: tc.color }}
                    >
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-snug" style={{ color: 'var(--ink)', fontWeight: n.read ? 400 : 600 }}>{n.title}</p>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: 'var(--purple)' }} />
                        )}
                      </div>
                      {n.body && <p className="text-xs mt-0.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{n.body}</p>}
                      <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
