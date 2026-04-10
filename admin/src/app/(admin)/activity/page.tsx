import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import {
  Briefcase, LifeBuoy, ShieldCheck, FileText, UserPlus,
  CheckCircle2, AlertTriangle, Users, Building2, Radio,
  MessageSquare, Calendar, LogIn,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Activity Feed' };
export const revalidate = 30;

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  role_created:        { icon: Briefcase,     color: 'var(--purple)',  label: 'New Role' },
  role_filled:         { icon: CheckCircle2,  color: 'var(--success)', label: 'Role Filled' },
  ticket_created:      { icon: LifeBuoy,      color: 'var(--amber)',   label: 'Ticket Raised' },
  ticket_resolved:     { icon: CheckCircle2,  color: 'var(--success)', label: 'Ticket Resolved' },
  compliance_updated:  { icon: ShieldCheck,    color: 'var(--blue)',    label: 'Compliance' },
  document_uploaded:   { icon: FileText,       color: 'var(--teal)',    label: 'Document' },
  candidate_added:     { icon: Users,          color: 'var(--purple)',  label: 'Candidate' },
  user_invited:        { icon: UserPlus,       color: 'var(--teal)',    label: 'User Invited' },
  service_request:     { icon: MessageSquare,  color: 'var(--amber)',   label: 'Service Request' },
  feature_toggled:     { icon: Radio,          color: 'var(--blue)',    label: 'Feature Toggle' },
  login:               { icon: LogIn,          color: 'var(--ink-faint)', label: 'Login' },
};

function getConfig(type: string) {
  return EVENT_CONFIG[type] ?? { icon: Calendar, color: 'var(--ink-faint)', label: type };
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ActivityPage() {
  const supabase = createServerSupabaseClient();

  // Build activity from multiple sources (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [reqRes, ticketRes, docRes, candRes, notesRes, complianceRes, servReqRes] = await Promise.all([
    supabase.from('requisitions').select('id, title, stage, created_at, updated_at, companies(name, id)')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(30),
    supabase.from('tickets').select('id, subject, status, created_at, resolved_at, companies(name, id)')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(30),
    supabase.from('documents').select('id, name, created_at, companies(name, id)')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
    supabase.from('candidates').select('id, full_name, created_at, companies(name, id)')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
    supabase.from('client_notes').select('id, title, note_type, created_at, companies(name, id), profiles(full_name)')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
    supabase.from('compliance_items').select('id, title, status, created_at, companies(name, id)')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
    supabase.from('service_requests').select('id, subject, status, created_at, companies(name, id)')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
  ]);

  // Merge into unified feed
  type FeedItem = { id: string; type: string; title: string; subtitle: string; companyName: string; companyId: string; href: string; timestamp: string };

  const feed: FeedItem[] = [
    ...(reqRes.data ?? []).map((r: any) => ({
      id: `req-${r.id}`, type: r.stage === 'filled' ? 'role_filled' : 'role_created',
      title: r.title, subtitle: r.stage === 'filled' ? 'Role filled' : `Stage: ${r.stage}`,
      companyName: r.companies?.name ?? '', companyId: r.companies?.id ?? '',
      href: `/hiring/${r.id}`, timestamp: r.created_at,
    })),
    ...(ticketRes.data ?? []).map((t: any) => ({
      id: `tick-${t.id}`, type: t.resolved_at ? 'ticket_resolved' : 'ticket_created',
      title: t.subject, subtitle: t.status,
      companyName: t.companies?.name ?? '', companyId: t.companies?.id ?? '',
      href: `/support/${t.id}`, timestamp: t.resolved_at ?? t.created_at,
    })),
    ...(docRes.data ?? []).map((d: any) => ({
      id: `doc-${d.id}`, type: 'document_uploaded',
      title: d.name, subtitle: 'Document uploaded',
      companyName: d.companies?.name ?? '', companyId: d.companies?.id ?? '',
      href: `/documents`, timestamp: d.created_at,
    })),
    ...(candRes.data ?? []).map((c: any) => ({
      id: `cand-${c.id}`, type: 'candidate_added',
      title: c.full_name, subtitle: 'Candidate added',
      companyName: c.companies?.name ?? '', companyId: c.companies?.id ?? '',
      href: `/candidates`, timestamp: c.created_at,
    })),
    ...(notesRes.data ?? []).map((n: any) => ({
      id: `note-${n.id}`, type: 'service_request',
      title: n.title ?? `${n.note_type} note`, subtitle: `by ${n.profiles?.full_name ?? 'TPS'}`,
      companyName: n.companies?.name ?? '', companyId: n.companies?.id ?? '',
      href: `/clients/${n.companies?.id ?? ''}`, timestamp: n.created_at,
    })),
    ...(complianceRes.data ?? []).map((c: any) => ({
      id: `comp-${c.id}`, type: 'compliance_updated',
      title: c.title, subtitle: `Status: ${c.status}`,
      companyName: c.companies?.name ?? '', companyId: c.companies?.id ?? '',
      href: `/compliance`, timestamp: c.created_at,
    })),
    ...(servReqRes.data ?? []).map((s: any) => ({
      id: `sr-${s.id}`, type: 'service_request',
      title: s.subject, subtitle: `Status: ${s.status}`,
      companyName: s.companies?.name ?? '', companyId: s.companies?.id ?? '',
      href: `/requests`, timestamp: s.created_at,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Group by date
  const grouped: Record<string, FeedItem[]> = {};
  feed.forEach(item => {
    const d = new Date(item.timestamp);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

    let key: string;
    if (d.toDateString() === today.toDateString()) key = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) key = 'Yesterday';
    else key = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  return (
    <>
      <AdminTopbar title="Activity Feed" subtitle="What's happening across all clients — last 7 days" />
      <main className="admin-page flex-1 max-w-[720px]">
        {feed.length === 0 ? (
          <div className="empty-state">
            <Calendar size={28} />
            <p className="text-sm font-medium">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <p className="eyebrow mb-3">{dateLabel}</p>
                <div className="space-y-0">
                  {items.map(item => {
                    const cfg = getConfig(item.type);
                    const Icon = cfg.icon;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex gap-3 py-2.5 px-1 rounded-lg transition-colors hover:bg-[var(--surface-soft)] group"
                      >
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${cfg.color}12`, color: cfg.color }}>
                            <Icon size={13} />
                          </div>
                          <div className="w-px flex-1 mt-1" style={{ background: 'var(--line)' }} />
                        </div>
                        <div className="flex-1 min-w-0 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${cfg.color}10`, color: cfg.color }}>
                              {cfg.label}
                            </span>
                            {item.companyName && (
                              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)' }}>
                                {item.companyName}
                              </span>
                            )}
                            <span className="text-[10px] ml-auto" style={{ color: 'var(--ink-faint)' }}>
                              {timeAgo(item.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'var(--ink)' }}>{item.title}</p>
                          <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{item.subtitle}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
