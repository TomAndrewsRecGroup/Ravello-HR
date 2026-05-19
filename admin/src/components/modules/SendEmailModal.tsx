'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Send, Paperclip, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useModalShell } from '@/components/ui/useModalShell';

const TiptapEditor = dynamic(() => import('./TiptapEditor'), { ssr: false });

export interface SendEmailTarget {
  type:        'athlete' | 'company' | 'candidate';
  id:          string;
  company_id?: string | null;
  /** Only used for type='company' — the specific portal user being
   *  emailed when the recipient is a client user (NOT the free-text
   *  override). Carried straight onto the email_log row. */
  profile_id?: string | null;
}

export interface SendEmailDefaults {
  to?:        string;
  subject?:   string;
  bodyHtml?:  string;
  /** Auto-populated dropdown of additional candidate recipients
   *  (e.g. all client portal users for a company target). When
   *  present, recipient becomes a select with a "custom" option. */
  candidateRecipients?: Array<{ email: string; label?: string; profile_id?: string }>;
}

interface Props {
  target:    SendEmailTarget;
  defaults?: SendEmailDefaults;
  /** Whether the calling staff member has SMTP configured. Controls
   *  the sender dropdown — when false, only Resend is available. */
  smtpConfigured: boolean;
  smtpFromEmail?: string | null;
  onClose:   () => void;
  onSent?:   (logId: string | null) => void;
}

const MAX_TOTAL = 25 * 1024 * 1024;

export default function SendEmailModal({
  target, defaults = {}, smtpConfigured, smtpFromEmail, onClose, onSent,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);
  const supabase = createClient();

  const candidates = defaults.candidateRecipients ?? [];
  const [recipientMode, setRecipientMode] = useState<'pick' | 'custom'>(
    candidates.length > 0 && defaults.to ? 'pick' : 'custom',
  );
  const [pickedRecipient, setPickedRecipient] = useState<string>(
    () => candidates.find(c => c.email === defaults.to)?.email ?? candidates[0]?.email ?? '',
  );
  const [customTo,  setCustomTo]  = useState(defaults.to ?? '');
  const [subject,   setSubject]   = useState(defaults.subject ?? '');
  const [body,      setBody]      = useState(defaults.bodyHtml ?? '');
  const [sender,    setSender]    = useState<'smtp' | 'resend'>(smtpConfigured ? 'smtp' : 'resend');
  const [files,     setFiles]     = useState<File[]>([]);
  const [sending,   setSending]   = useState(false);
  const [result,    setResult]    = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const recipient = recipientMode === 'pick'
    ? pickedRecipient
    : customTo.trim();
  const pickedProfileId = recipientMode === 'pick'
    ? candidates.find(c => c.email === pickedRecipient)?.profile_id ?? null
    : null;

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const tooBig = totalBytes > MAX_TOTAL;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    setFiles(next);
  }
  function removeFile(idx: number) {
    setFiles(arr => arr.filter((_, i) => i !== idx));
  }

  async function send() {
    if (!recipient) { setResult({ kind: 'err', text: 'Recipient is required.' });  return; }
    if (!subject)   { setResult({ kind: 'err', text: 'Subject is required.' });    return; }
    if (!body.trim() || body === '<p></p>') {
      setResult({ kind: 'err', text: 'Body is empty.' });
      return;
    }
    if (tooBig) {
      setResult({ kind: 'err', text: 'Total attachments exceed the 25 MB limit.' });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set('target_type', target.type);
      fd.set('target_id',   target.id);
      if (target.company_id) fd.set('company_id', target.company_id);
      const profileId = target.profile_id ?? pickedProfileId;
      if (profileId) fd.set('profile_id', profileId);
      fd.set('to',        recipient);
      fd.set('subject',   subject);
      fd.set('body_html', body);
      fd.set('sender',    sender);
      files.forEach((f, i) => fd.append(`attachment-${i}`, f, f.name));

      const res = await fetch('/api/admin/send-email', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ kind: 'err', text: json.error ?? `Send failed (${res.status})` });
        return;
      }
      setResult({ kind: 'ok', text: 'Email sent.' });
      onSent?.(json.log_id ?? null);
      // Brief pause so the success state is visible, then close.
      setTimeout(() => onClose(), 700);
    } catch (e) {
      setResult({ kind: 'err', text: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog" aria-modal="true" aria-labelledby="send-email-title"
        className="card w-full max-w-2xl max-h-[92vh] flex flex-col p-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Send size={16} style={{ color: 'var(--purple)' }} />
          <h2 id="send-email-title" className="font-display font-semibold flex-1">Send email</h2>
          <button onClick={onClose} className="btn-icon btn-ghost"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Recipient */}
          {candidates.length > 0 && (
            <div className="flex gap-2 text-xs">
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input type="radio" checked={recipientMode === 'pick'} onChange={() => setRecipientMode('pick')} />
                Pick a user
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input type="radio" checked={recipientMode === 'custom'} onChange={() => setRecipientMode('custom')} />
                Custom email
              </label>
            </div>
          )}
          <div>
            <p className="label">To</p>
            {recipientMode === 'pick' && candidates.length > 0 ? (
              <select className="input" value={pickedRecipient} onChange={e => setPickedRecipient(e.target.value)}>
                {candidates.map(c => (
                  <option key={c.email} value={c.email}>
                    {c.label ? `${c.label} — ${c.email}` : c.email}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                type="email"
                placeholder="someone@example.com"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
              />
            )}
          </div>

          {/* Sender */}
          <div>
            <p className="label">From</p>
            <select className="input" value={sender} onChange={e => setSender(e.target.value as 'smtp' | 'resend')}>
              {smtpConfigured && (
                <option value="smtp">Your SMTP — {smtpFromEmail ?? 'configured account'}</option>
              )}
              <option value="resend">The People System (Resend, branded shell)</option>
            </select>
            {!smtpConfigured && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                Want to send from your own address? Set up SMTP in Account → Email Settings.
              </p>
            )}
          </div>

          <div>
            <p className="label">Subject</p>
            <input className="input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject…" />
          </div>

          <div>
            <p className="label">Body</p>
            <TiptapEditor value={body} onChange={setBody} placeholder="Write your message…" />
            {sender === 'smtp' && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                Your signature (set in Email Settings) is appended below this body automatically.
              </p>
            )}
          </div>

          {/* Attachments */}
          <div>
            <p className="label">Attachments</p>
            <div className="flex flex-wrap items-center gap-2">
              <label
                className="btn-secondary btn-sm cursor-pointer"
                title="Click to attach files (max 25 MB total)"
              >
                <Paperclip size={12} /> Add files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <span className="text-[11px]" style={{ color: tooBig ? 'var(--red)' : 'var(--ink-faint)' }}>
                {files.length === 0
                  ? 'No files'
                  : `${files.length} file${files.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}${tooBig ? ' — over 25 MB' : ''}`}
              </span>
            </div>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded-md" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
                    <Paperclip size={11} style={{ color: 'var(--ink-faint)' }} />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span style={{ color: 'var(--ink-faint)' }}>{formatBytes(f.size)}</span>
                    <button onClick={() => removeFile(i)} className="btn-icon btn-sm" title="Remove">
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {result && (
            <div
              className="rounded-md px-3 py-2 text-xs inline-flex items-start gap-2"
              style={{
                background: result.kind === 'ok' ? 'rgba(20,184,166,0.10)' : 'rgba(220,38,38,0.08)',
                color:      result.kind === 'ok' ? 'var(--teal)'           : 'var(--red)',
                border: `1px solid ${result.kind === 'ok' ? 'rgba(20,184,166,0.25)' : 'rgba(220,38,38,0.2)'}`,
              }}
            >
              {result.kind === 'ok' ? <CheckCircle2 size={13} className="mt-0.5" /> : <AlertCircle size={13} className="mt-0.5" />}
              <span>{result.text}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="btn-ghost btn-sm">Cancel</button>
          <button
            onClick={send}
            disabled={sending || tooBig}
            className="btn-cta btn-sm ml-auto"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
