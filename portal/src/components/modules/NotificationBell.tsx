'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, X, BarChart2, Building2, Target, MessageSquare, AlertTriangle, Headphones } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const TYPE_META: Record<string, { Icon: any; color: string }> = {
  role_pending_approval:    { Icon: BarChart2,       color: '#a855f7' },
  ivylens_ticket_reply:     { Icon: Headphones,      color: '#a855f7' },
  ivylens_ticket_resolved:  { Icon: Check,           color: '#10b981' },
  friction_complete:        { Icon: BarChart2,        color: '#a855f7' },
  assessment_complete:      { Icon: Building2,        color: '#06b6d4' },
  bd_leads_new:             { Icon: Target,           color: '#10b981' },
  high_friction_alert:      { Icon: AlertTriangle,    color: '#ef4444' },
  default:                  { Icon: MessageSquare,    color: '#6b7280' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function NotificationBell() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function fetchNotifications() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setNotifications(data ?? []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchNotifications(); }, []);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function markRead(id: string) {
    try {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
      if (error) throw error;
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }

  async function markAllRead() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }

  function handleClick(n: any) {
    markRead(n.id);
    if (n.link) router.push(n.link);
    setOpen(false);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn-icon relative"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5"
            style={{ background: 'var(--gradient)', lineHeight: 1 }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-[16px] overflow-hidden"
          style={{
            width: 360,
            maxHeight: 440,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 12px 48px rgba(10,15,30,0.14), 0 2px 8px rgba(10,15,30,0.06)',
            zIndex: 60,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Notifications {unreadCount > 0 && <span className="font-normal" style={{ color: 'var(--ink-faint)' }}>({unreadCount} new)</span>}
            </p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--purple)' }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={20} style={{ color: 'var(--ink-faint)', margin: '0 auto 8px' }} />
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const meta = TYPE_META[n.type] ?? TYPE_META.default;
                const NIcon = meta.Icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--surface-alt)] transition-colors"
                    style={{
                      borderBottom: '1px solid var(--line)',
                      background: n.read ? 'transparent' : 'rgba(124,58,237,0.03)',
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${meta.color}14` }}
                    >
                      <NIcon size={13} style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: n.read ? 'var(--ink-soft)' : 'var(--ink)' }}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: 'var(--purple)' }} />
                    )}
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
