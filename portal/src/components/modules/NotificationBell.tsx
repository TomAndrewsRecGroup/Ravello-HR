'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, BarChart2, MessageSquare, AlertTriangle, Headphones, Users, CheckSquare, ShieldCheck, FileText, CalendarClock, HardHat, Sparkles } from 'lucide-react';
import { isNotificationType, type NotificationType } from '@/lib/notify/types';
import { createClient } from '@/lib/supabase/client';

// Keyed by the one vocabulary; notificationTypes.test.ts pins the two
// against each other in both directions.
const TYPE_META: Record<NotificationType, { Icon: React.ElementType; color: string }> = {
  general:                    { Icon: MessageSquare,  color: 'var(--ink-faint)' },
  role_pending_approval:      { Icon: BarChart2,      color: 'var(--purple)' },
  candidate_stage_move:       { Icon: Users,          color: 'var(--purple)' },
  candidate_feedback:         { Icon: Users,          color: 'var(--teal)' },
  service_request_created:    { Icon: Headphones,     color: 'var(--amber)' },
  service_request_overdue:    { Icon: Headphones,     color: 'var(--danger)' },
  ivylens_ticket_reply:       { Icon: Headphones,     color: 'var(--purple)' },
  ivylens_ticket_resolved:    { Icon: Check,          color: 'var(--success)' },
  action_completed:           { Icon: Check,          color: 'var(--success)' },
  task_assigned:              { Icon: CheckSquare,    color: 'var(--blue)' },
  task_due:                   { Icon: CheckSquare,    color: 'var(--amber)' },
  payment_failed:             { Icon: AlertTriangle,  color: 'var(--danger)' },
  compliance_due_soon:        { Icon: ShieldCheck,    color: 'var(--amber)' },
  compliance_overdue:         { Icon: ShieldCheck,    color: 'var(--danger)' },
  document_review_due:        { Icon: FileText,       color: 'var(--amber)' },
  employee_document_expiring: { Icon: FileText,       color: 'var(--amber)' },
  employee_document_expired:  { Icon: FileText,       color: 'var(--danger)' },
  policy_ack_overdue:         { Icon: FileText,       color: 'var(--danger)' },
  review_due:                 { Icon: CalendarClock,  color: 'var(--amber)' },
  checklist_task_due:         { Icon: CheckSquare,    color: 'var(--amber)' },
  probation_ending:           { Icon: CalendarClock,  color: 'var(--blue)' },
  absence_pending:            { Icon: CalendarClock,  color: 'var(--amber)' },
  hs_check_failed:            { Icon: HardHat,        color: 'var(--danger)' },
  hs_actions_raised:          { Icon: HardHat,        color: 'var(--amber)' },
  hs_activity_logged:         { Icon: HardHat,        color: 'var(--blue)' },
  hs_evidence_added:          { Icon: FileText,       color: 'var(--blue)' },
  hs_item_added:              { Icon: HardHat,        color: 'var(--blue)' },
  hs_action_done:             { Icon: Check,          color: 'var(--success)' },
  hs_followup_suggested:      { Icon: Sparkles,       color: 'var(--purple)' },
  leave_requested:            { Icon: CalendarClock,  color: 'var(--amber)' },
  role_filled:                { Icon: Check,          color: 'var(--success)' },
  onboarding_started:         { Icon: Users,          color: 'var(--blue)' },
  onboarding_risk:            { Icon: AlertTriangle,  color: 'var(--amber)' },
  probation_review_scheduled: { Icon: CalendarClock,  color: 'var(--blue)' },
  offboarding_started:        { Icon: Users,          color: 'var(--amber)' },
  employee_left:              { Icon: Users,          color: 'var(--ink-faint)' },
  document_uploaded:          { Icon: FileText,       color: 'var(--blue)' },
  document_shared:            { Icon: FileText,       color: 'var(--blue)' },
  document_approved:          { Icon: FileText,       color: 'var(--success)' },
  absence_pattern_flag:       { Icon: Sparkles,       color: 'var(--purple)' },
  service_request_updated:    { Icon: Headphones,     color: 'var(--blue)' },
  service_request_completed:  { Icon: Check,          color: 'var(--success)' },
  sla_breached:               { Icon: AlertTriangle,  color: 'var(--red)' },
  client_at_risk:             { Icon: AlertTriangle,  color: 'var(--red)' },
  enquiry_received:           { Icon: Users,          color: 'var(--purple)' },
  policy_ack_signed:          { Icon: Check,          color: 'var(--success)' },
  policy_ack_needs_email:     { Icon: AlertTriangle,  color: 'var(--amber)' },
  role_stage_changed:         { Icon: BarChart2,      color: 'var(--purple)' },
  candidate_shared:           { Icon: Users,          color: 'var(--purple)' },
  interview_scheduled:        { Icon: CalendarClock,  color: 'var(--blue)' },
  interview_cancelled:        { Icon: CalendarClock,  color: 'var(--ink-faint)' },
  offer_sent:                 { Icon: BarChart2,      color: 'var(--teal)' },
  offer_decided:              { Icon: BarChart2,      color: 'var(--teal)' },
  role_stale:                 { Icon: BarChart2,      color: 'var(--amber)' },
  offer_deadline:             { Icon: CalendarClock,  color: 'var(--amber)' },
  referral_review_pending:    { Icon: Users,          color: 'var(--amber)' },
  referral_scan_failed:       { Icon: AlertTriangle,  color: 'var(--red)' },
};

export const BELL_TYPE_KEYS = Object.keys(TYPE_META);

function metaFor(type: string) {
  return isNotificationType(type) ? TYPE_META[type] : TYPE_META.general;
}

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
  const userIdRef = useRef<string | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function fetchNotifications() {
    try {
      // Cache user id after the first call so markAllRead doesn't hit auth again.
      if (!userIdRef.current) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        userIdRef.current = user.id;
      }
      const { data, error } = await supabase
        .from('notifications')
        .select('id,type,title,body,link,read,created_at')
        .eq('user_id', userIdRef.current)
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

  useEffect(() => {
    // Turn IvyLens ticket replies/resolutions into notifications before
    // listing them. Throttled to once per 5 minutes per browser: the bell
    // mounts with every section's Topbar. The route returns immediately
    // for a company with no IvyLens tickets.
    let shouldPoll = true;
    try {
      const last = Number(sessionStorage.getItem('ivylens_poll_at') ?? 0);
      shouldPoll = Date.now() - last > 5 * 60_000;
      if (shouldPoll) sessionStorage.setItem('ivylens_poll_at', String(Date.now()));
    } catch { /* storage blocked: poll anyway */ }
    const poll = shouldPoll
      ? fetch('/api/support/poll').catch(() => undefined)
      : Promise.resolve(undefined);
    poll.finally(() => fetchNotifications());
  }, []);

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
      const userId = userIdRef.current;
      if (!userId) return;
      const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
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
                const meta = metaFor(n.type);
                const NIcon = meta.Icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--surface-alt)] transition-colors"
                    style={{
                      borderBottom: '1px solid var(--line)',
                      background: n.read ? 'transparent' : 'rgba(11,120,150,0.03)',
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
