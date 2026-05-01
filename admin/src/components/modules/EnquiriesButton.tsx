'use client';
import { useEffect, useRef, useState } from 'react';
import { Inbox, Mail, Phone, Building2, Clock, X, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Enquiry {
  id:           string;
  full_name:    string;
  email:        string;
  phone:        string | null;
  company_name: string | null;
  source:       string;
  result:       Record<string, unknown> | null;
  status:       'new' | 'contacted' | 'booked' | 'closed';
  created_at:   string;
}

const SOURCE_LABEL: Record<string, string> = {
  hiring_score:       'Smart Hiring Score',
  hr_risk:            'HR Risk Score',
  policy_healthcheck: 'Policy Healthcheck',
  due_diligence:      'DD Checklist',
  contact:            'Contact',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function EnquiriesButton() {
  const supabase = createClient();
  const ref      = useRef<HTMLDivElement>(null);

  const [open,        setOpen]        = useState(false);
  const [enquiries,   setEnquiries]   = useState<Enquiry[]>([]);
  const [newCount,    setNewCount]    = useState(0);
  const [loading,     setLoading]     = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('enquiries')
      .select('id, full_name, email, phone, company_name, source, result, status, created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    setEnquiries((data ?? []) as Enquiry[]);
    setNewCount(((data ?? []) as Enquiry[]).filter((e) => e.status === 'new').length);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel('admin-enquiries')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'enquiries' },
        (payload) => {
          const row = payload.new as Enquiry;
          setEnquiries((prev) => [row, ...prev].slice(0, 30));
          setNewCount((c) => c + 1);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function markStatus(id: string, status: Enquiry['status']) {
    await supabase.from('enquiries').update({ status }).eq('id', id);
    setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
    setNewCount(enquiries.filter((e) => (e.id === id ? false : e.status === 'new')).length);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Enquiries"
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors"
        style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--ink-soft)' }}
      >
        <Inbox size={17} />
        {newCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1"
            style={{ background: 'var(--purple)', color: '#fff' }}
          >
            {newCount > 99 ? '99+' : newCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[420px] max-h-[640px] rounded-[14px] overflow-hidden flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 12px 48px rgba(7,11,29,0.14)',
            zIndex: 60,
          }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Enquiries</p>
              <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                {newCount > 0 ? `${newCount} new` : 'All caught up'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/enquiries"
                onClick={() => setOpen(false)}
                className="text-[11px] font-semibold"
                style={{ color: 'var(--purple)' }}
              >
                View all
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center"
                style={{ color: 'var(--ink-faint)' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--ink-faint)' }}>Loading…</p>
            )}
            {!loading && enquiries.length === 0 && (
              <div className="py-12 text-center">
                <Inbox size={28} className="mx-auto mb-3" style={{ color: 'var(--ink-faint)' }} />
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No enquiries yet.</p>
              </div>
            )}
            {enquiries.map((e) => (
              <Row key={e.id} enquiry={e} onStatus={markStatus} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ enquiry, onStatus }: { enquiry: Enquiry; onStatus: (id: string, s: Enquiry['status']) => void }) {
  const [open, setOpen] = useState(false);
  const isNew = enquiry.status === 'new';
  return (
    <div
      className="px-4 py-3"
      style={{
        borderBottom: '1px solid var(--line)',
        background: isNew ? 'rgba(124,58,237,0.04)' : 'transparent',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{enquiry.full_name}</p>
            <span
              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
              style={{
                background: isNew ? 'rgba(124,58,237,0.12)' : 'var(--surface-alt)',
                color:      isNew ? 'var(--purple)'        : 'var(--ink-faint)',
              }}
            >
              {enquiry.status}
            </span>
          </div>
          <p className="text-[11px] mb-1" style={{ color: 'var(--ink-faint)' }}>
            {SOURCE_LABEL[enquiry.source] ?? enquiry.source} · {timeAgo(enquiry.created_at)}
          </p>
          <div className="space-y-0.5">
            <p className="text-[11px] flex items-center gap-1.5 truncate" style={{ color: 'var(--ink-soft)' }}>
              <Mail size={11} /> <a href={`mailto:${enquiry.email}`} className="truncate hover:underline">{enquiry.email}</a>
            </p>
            {enquiry.phone && (
              <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
                <Phone size={11} /> <a href={`tel:${enquiry.phone}`} className="hover:underline">{enquiry.phone}</a>
              </p>
            )}
            {enquiry.company_name && (
              <p className="text-[11px] flex items-center gap-1.5 truncate" style={{ color: 'var(--ink-soft)' }}>
                <Building2 size={11} /> {enquiry.company_name}
              </p>
            )}
          </div>
        </div>
      </div>

      {enquiry.result && Object.keys(enquiry.result).length > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] font-semibold mt-2"
          style={{ color: 'var(--purple)' }}
        >
          {open ? 'Hide result' : 'View result'}
        </button>
      )}
      {open && enquiry.result && (
        <pre
          className="mt-2 text-[10px] p-2 rounded-md overflow-auto max-h-40"
          style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}
        >{JSON.stringify(enquiry.result, null, 2)}</pre>
      )}

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {(['new', 'contacted', 'booked', 'closed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onStatus(enquiry.id, s)}
            disabled={enquiry.status === s}
            className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
            style={{
              background:  enquiry.status === s ? 'var(--purple)'        : 'var(--surface-alt)',
              color:       enquiry.status === s ? '#fff'                 : 'var(--ink-soft)',
              opacity:     enquiry.status === s ? 1                      : 0.85,
            }}
          >
            {s}
          </button>
        ))}
        <a
          href={`mailto:${enquiry.email}?subject=Re: your ${SOURCE_LABEL[enquiry.source] ?? 'enquiry'}`}
          className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1"
          style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}
        >
          Reply <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}
