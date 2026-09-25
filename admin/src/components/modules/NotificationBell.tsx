'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Bell, Briefcase, LifeBuoy, ShieldCheck, Users,
  FileText, AlertTriangle, CheckCircle2, CheckSquare, CalendarClock, HardHat, Sparkles,
} from 'lucide-react';
import { isNotificationType, type NotificationType } from '@/lib/notify/types';
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

// Keyed by the one vocabulary; notificationTypes.test.ts pins the two
// against each other in both directions.
const TYPE_CONFIG: Record<NotificationType, { icon: React.ElementType; color: string }> = {
  general:                    { icon: Bell,          color: 'var(--ink-faint)' },
  role_pending_approval:      { icon: Briefcase,     color: 'var(--purple)' },
  candidate_stage_move:       { icon: Users,         color: 'var(--purple)' },
  candidate_feedback:         { icon: Users,         color: 'var(--teal)' },
  service_request_created:    { icon: LifeBuoy,      color: 'var(--amber)' },
  service_request_overdue:    { icon: LifeBuoy,      color: 'var(--danger)' },
  ivylens_ticket_reply:       { icon: LifeBuoy,      color: 'var(--purple)' },
  ivylens_ticket_resolved:    { icon: CheckCircle2,  color: 'var(--success)' },
  action_completed:           { icon: CheckCircle2,  color: 'var(--success)' },
  task_assigned:              { icon: CheckSquare,   color: 'var(--blue)' },
  task_due:                   { icon: CheckSquare,   color: 'var(--amber)' },
  payment_failed:             { icon: AlertTriangle, color: 'var(--danger)' },
  compliance_due_soon:        { icon: ShieldCheck,   color: 'var(--amber)' },
  compliance_overdue:         { icon: ShieldCheck,   color: 'var(--danger)' },
  document_review_due:        { icon: FileText,      color: 'var(--amber)' },
  employee_document_expiring: { icon: FileText,      color: 'var(--amber)' },
  employee_document_expired:  { icon: FileText,      color: 'var(--danger)' },
  policy_ack_overdue:         { icon: FileText,      color: 'var(--danger)' },
  review_due:                 { icon: CalendarClock, color: 'var(--amber)' },
  checklist_task_due:         { icon: CheckSquare,   color: 'var(--amber)' },
  probation_ending:           { icon: CalendarClock, color: 'var(--blue)' },
  absence_pending:            { icon: CalendarClock, color: 'var(--amber)' },
  hs_check_failed:            { icon: HardHat,       color: 'var(--danger)' },
  hs_actions_raised:          { icon: HardHat,       color: 'var(--amber)' },
  hs_activity_logged:         { icon: HardHat,       color: 'var(--blue)' },
  hs_evidence_added:          { icon: FileText,      color: 'var(--blue)' },
  hs_item_added:              { icon: HardHat,       color: 'var(--blue)' },
  hs_action_done:             { icon: CheckCircle2,  color: 'var(--success)' },
  hs_followup_suggested:      { icon: Sparkles,      color: 'var(--purple)' },
  provider_access_ending:     { icon: HardHat,       color: 'var(--amber)' },
  leave_requested:            { icon: CalendarClock, color: 'var(--amber)' },
  role_filled:                { icon: CheckCircle2,  color: 'var(--success)' },
  onboarding_started:         { icon: Users,         color: 'var(--blue)' },
  onboarding_risk:            { icon: AlertTriangle, color: 'var(--amber)' },
  probation_review_scheduled: { icon: CalendarClock, color: 'var(--blue)' },
  offboarding_started:        { icon: Users,         color: 'var(--amber)' },
  employee_left:              { icon: Users,         color: 'var(--ink-faint)' },
  document_uploaded:          { icon: FileText,      color: 'var(--blue)' },
  document_shared:            { icon: FileText,      color: 'var(--blue)' },
  document_approved:          { icon: FileText,      color: 'var(--success)' },
  absence_pattern_flag:       { icon: Sparkles,      color: 'var(--purple)' },
  service_request_updated:    { icon: LifeBuoy,      color: 'var(--blue)' },
  service_request_completed:  { icon: CheckCircle2,  color: 'var(--success)' },
  sla_breached:               { icon: AlertTriangle, color: 'var(--red)' },
  client_at_risk:             { icon: AlertTriangle, color: 'var(--red)' },
  enquiry_received:           { icon: Users,         color: 'var(--purple)' },
  policy_ack_signed:          { icon: CheckCircle2,  color: 'var(--success)' },
  policy_ack_needs_email:     { icon: AlertTriangle, color: 'var(--amber)' },
  role_stage_changed:         { icon: Briefcase,     color: 'var(--purple)' },
  candidate_shared:           { icon: Users,         color: 'var(--purple)' },
  interview_scheduled:        { icon: CalendarClock, color: 'var(--blue)' },
  interview_cancelled:        { icon: CalendarClock, color: 'var(--ink-faint)' },
  offer_sent:                 { icon: Briefcase,     color: 'var(--teal)' },
  offer_decided:              { icon: Briefcase,     color: 'var(--teal)' },
  role_stale:                 { icon: Briefcase,     color: 'var(--amber)' },
  offer_deadline:             { icon: CalendarClock, color: 'var(--amber)' },
  referral_review_pending:    { icon: Users,         color: 'var(--amber)' },
  referral_scan_failed:       { icon: AlertTriangle, color: 'var(--red)' },
};

export const BELL_TYPE_KEYS = Object.keys(TYPE_CONFIG);

function getTypeConfig(type: string) {
  return isNotificationType(type) ? TYPE_CONFIG[type] : TYPE_CONFIG.general;
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
    // userIdRef is populated by loadNotifications() on mount; markAllRead is
    // only reachable via a button rendered after that completes.
    const userId = userIdRef.current;
    if (!userId) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function clearAll() {
    const userId = userIdRef.current;
    if (!userId) return;
    await supabase.from('notifications').delete().eq('user_id', userId).eq('read', true);
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
       aria-label="Notifications">
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
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--rose)' }}>
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
                      background: n.read ? undefined : 'rgba(11,120,150,0.03)',
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
