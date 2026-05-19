'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Paperclip, ChevronDown, AlertCircle } from 'lucide-react';

interface Props {
  targetType: 'athlete' | 'company' | 'candidate';
  targetId:   string;
  /** Increment this from the parent to force a re-fetch (e.g. after
   *  a SendEmailModal closes successfully). */
  refreshKey?: number;
  /** Maximum rows shown. Defaults to 10. */
  limit?: number;
}

interface Row {
  id:           string;
  to_email:     string;
  subject:      string;
  body_html:    string;
  attachments:  Array<{ name: string; size: number; mime: string }> | null;
  sender_kind:  'resend' | 'smtp';
  sender_email: string;
  sent_at:      string;
  error_message: string | null;
}

export default function EmailLogList({ targetType, targetId, refreshKey = 0, limit = 10 }: Props) {
  const supabase = createClient();
  const [rows,     setRows]     = useState<Row[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [openId,   setOpenId]   = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('email_log')
      .select('id,to_email,subject,body_html,attachments,sender_kind,sender_email,sent_at,error_message')
      .eq('target_type', targetType)
      .eq('target_id',   targetId)
      .order('sent_at', { ascending: false })
      .limit(limit);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [supabase, targetType, targetId, limit]);

  useEffect(() => { fetchRows(); }, [fetchRows, refreshKey]);

  if (loading) {
    return (
      <div className="text-[11px] py-2" style={{ color: 'var(--ink-faint)' }}>
        Loading email history…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-[11px] py-2" style={{ color: 'var(--ink-faint)' }}>
        No emails sent yet.
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map(r => {
        const open = openId === r.id;
        const failed = Boolean(r.error_message);
        return (
          <li
            key={r.id}
            className="rounded-md text-xs"
            style={{
              background: failed ? 'rgba(220,38,38,0.05)' : 'var(--surface-soft)',
              border: `1px solid ${failed ? 'rgba(220,38,38,0.18)' : 'var(--line)'}`,
            }}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
            >
              {failed
                ? <AlertCircle size={11} style={{ color: 'var(--red)' }} />
                : <Mail size={11} style={{ color: 'var(--purple)' }} />}
              <span className="font-semibold flex-1 truncate" style={{ color: 'var(--ink)' }}>
                {r.subject || '(no subject)'}
              </span>
              {r.attachments && r.attachments.length > 0 && (
                <Paperclip size={10} style={{ color: 'var(--ink-faint)' }} />
              )}
              <span style={{ color: 'var(--ink-faint)' }}>
                {new Date(r.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              <ChevronDown size={10} style={{ color: 'var(--ink-faint)', transform: open ? 'rotate(180deg)' : '' }} />
            </button>
            {open && (
              <div className="px-3 pb-2 pt-1 space-y-1">
                <p style={{ color: 'var(--ink-soft)' }}>
                  <strong>To:</strong> {r.to_email}
                  <span style={{ color: 'var(--ink-faint)' }}> · </span>
                  <strong>From:</strong> {r.sender_email}
                  <span style={{ color: 'var(--ink-faint)' }}> · {r.sender_kind === 'smtp' ? 'via SMTP' : 'via Resend'}</span>
                </p>
                <p style={{ color: 'var(--ink-faint)' }}>
                  {new Date(r.sent_at).toLocaleString('en-GB')}
                </p>
                {r.attachments && r.attachments.length > 0 && (
                  <p>
                    <strong style={{ color: 'var(--ink-soft)' }}>Attached:</strong>{' '}
                    {r.attachments.map(a => a.name).join(', ')}
                  </p>
                )}
                {r.error_message && (
                  <p style={{ color: 'var(--red)' }}><strong>Error:</strong> {r.error_message}</p>
                )}
                <details className="mt-1.5">
                  <summary className="cursor-pointer" style={{ color: 'var(--ink-soft)' }}>View body</summary>
                  <div
                    className="mt-1 p-2 rounded prose prose-sm max-w-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
                    dangerouslySetInnerHTML={{ __html: r.body_html }}
                  />
                </details>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
