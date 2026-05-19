'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Mail, KeyRound, Eraser, Send } from 'lucide-react';

interface Initial {
  smtp_host:             string;
  smtp_port:             number;
  smtp_secure:           boolean;
  smtp_user:             string;
  has_pass:              boolean;
  smtp_from_name:        string;
  smtp_from_email:       string;
  smtp_reply_to:         string;
  email_signature_html:  string;
  smtp_last_verified_at: string | null;
}

interface Props { initial: Initial; ownEmail: string }

export default function EmailSettingsForm({ initial, ownEmail }: Props) {
  const [host,        setHost]        = useState(initial.smtp_host);
  const [port,        setPort]        = useState<number | ''>(initial.smtp_port);
  const [secure,      setSecure]      = useState(initial.smtp_secure);
  const [user,        setUser]        = useState(initial.smtp_user);
  const [pass,        setPass]        = useState('');           // never reads back from server
  const [hasPass,     setHasPass]     = useState(initial.has_pass);
  const [fromName,    setFromName]    = useState(initial.smtp_from_name);
  const [fromEmail,   setFromEmail]   = useState(initial.smtp_from_email);
  const [replyTo,     setReplyTo]     = useState(initial.smtp_reply_to);
  const [signature,   setSignature]   = useState(initial.email_signature_html);
  const [verifiedAt,  setVerifiedAt]  = useState<string | null>(initial.smtp_last_verified_at);

  const [saving,      setSaving]      = useState(false);
  const [verifying,   setVerifying]   = useState(false);
  const [testing,     setTesting]     = useState(false);
  const [clearing,    setClearing]    = useState(false);
  const [savedAt,     setSavedAt]     = useState<number | null>(null);
  const [message,     setMessage]     = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [testTo,      setTestTo]      = useState(ownEmail);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp_host:        host,
          smtp_port:        port === '' ? null : Number(port),
          smtp_secure:      secure,
          smtp_user:        user,
          smtp_pass:        pass || undefined,        // omit to keep existing
          smtp_from_name:   fromName,
          smtp_from_email:  fromEmail,
          smtp_reply_to:    replyTo,
          email_signature_html: signature,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: 'err', text: json.error ?? `Save failed (${res.status})` });
        return;
      }
      if (pass) { setHasPass(true); setPass(''); }
      setSavedAt(Date.now());
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setVerifying(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'verify', to: '' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: 'err', text: json.error ?? `Verify failed (${res.status})` });
        return;
      }
      setVerifiedAt(json.verified_at);
      setMessage({ kind: 'ok', text: 'SMTP connection verified.' });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setVerifying(false);
    }
  }

  async function sendTest() {
    if (!testTo.trim()) {
      setMessage({ kind: 'err', text: 'Recipient email is required.' });
      return;
    }
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'send', to: testTo.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: 'err', text: json.error ?? `Test send failed (${res.status})` });
        return;
      }
      setVerifiedAt(new Date().toISOString());
      setMessage({ kind: 'ok', text: `Test email sent to ${testTo}. Message id: ${json.message_id ?? '—'}` });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function clearConfig() {
    if (!confirm('Clear your SMTP configuration? Future outbound emails from you will fall back to the The People System Resend account.')) return;
    setClearing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: 'err', text: json.error ?? 'Clear failed' });
        return;
      }
      setHost(''); setPort(587); setSecure(true); setUser(''); setPass('');
      setFromName(''); setFromEmail(''); setReplyTo(''); setHasPass(false);
      setVerifiedAt(null);
      setMessage({ kind: 'ok', text: 'SMTP configuration cleared.' });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-5 max-w-[760px]">
      {/* SMTP credentials */}
      <section className="card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <Mail size={16} style={{ color: 'var(--purple)' }} />
          <h2 className="font-display font-semibold">SMTP Server</h2>
          {verifiedAt && (
            <span className="ml-auto text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}>
              <CheckCircle2 size={11} /> Verified {new Date(verifiedAt).toLocaleString('en-GB')}
            </span>
          )}
        </header>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Host">
            <input className="input" placeholder="smtp.office365.com" value={host} onChange={e => setHost(e.target.value)} />
          </Field>
          <Field label="Port">
            <input className="input" type="number" placeholder="587" value={port}
                   onChange={e => setPort(e.target.value === '' ? '' : Number(e.target.value))} />
          </Field>
          <Field label="Username">
            <input className="input" placeholder="you@yourdomain.com" value={user} onChange={e => setUser(e.target.value)} />
          </Field>
          <Field label="Password">
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                type="password"
                placeholder={hasPass ? '●●●●●●●● (saved — leave blank to keep)' : 'App password / mailbox password'}
                value={pass}
                onChange={e => setPass(e.target.value)}
                autoComplete="new-password"
              />
              <KeyRound size={14} style={{ color: 'var(--ink-faint)' }} />
            </div>
          </Field>
        </div>
        <label className="inline-flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={secure} onChange={e => setSecure(e.target.checked)} />
          Use TLS / secure connection (port 465 typically secure; 587 typically STARTTLS — leave on for both unless your provider says otherwise)
        </label>
      </section>

      {/* From identity */}
      <section className="card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <h2 className="font-display font-semibold">From Address</h2>
        </header>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Display name">
            <input className="input" placeholder="Tom Andrews" value={fromName} onChange={e => setFromName(e.target.value)} />
          </Field>
          <Field label="From email">
            <input className="input" type="email" placeholder="tom@yourdomain.com" value={fromEmail} onChange={e => setFromEmail(e.target.value)} />
          </Field>
          <Field label="Reply-To (optional)">
            <input className="input" type="email" placeholder="hello@yourdomain.com" value={replyTo} onChange={e => setReplyTo(e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Signature */}
      <section className="card p-5 space-y-3">
        <header>
          <h2 className="font-display font-semibold">Email Signature</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Appended to every SMTP email below your message. HTML allowed — paste from Outlook / Gmail signature generators. Plain text also works.
          </p>
        </header>
        <textarea
          className="input font-mono text-xs"
          rows={8}
          placeholder={`Best regards,\nTom Andrews\nThe People System\n<a href="https://thepeoplesystem.co.uk">thepeoplesystem.co.uk</a>`}
          value={signature}
          onChange={e => setSignature(e.target.value)}
        />
        {signature && (
          <details className="rounded-md p-3 text-xs" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
            <summary className="cursor-pointer font-semibold" style={{ color: 'var(--ink-soft)' }}>Preview</summary>
            <div className="mt-2 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: signature }} />
          </details>
        )}
      </section>

      {/* Actions */}
      <section className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={saving} className="btn-cta">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button onClick={verify} disabled={verifying} className="btn-secondary">
            {verifying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {verifying ? 'Verifying…' : 'Verify connection'}
          </button>
          {(host || hasPass) && (
            <button onClick={clearConfig} disabled={clearing} className="btn-ghost" style={{ color: 'var(--red)' }}>
              <Eraser size={13} /> {clearing ? 'Clearing…' : 'Clear SMTP'}
            </button>
          )}
          {savedAt && (
            <span className="text-[11px] ml-auto" style={{ color: 'var(--ink-faint)' }}>
              Saved at {new Date(savedAt).toLocaleTimeString('en-GB')}
            </span>
          )}
        </div>

        <div className="pt-4" style={{ borderTop: '1px dashed var(--line)' }}>
          <p className="label">Send test email</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1 min-w-[220px]"
              type="email"
              placeholder="recipient@example.com"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
            />
            <button onClick={sendTest} disabled={testing} className="btn-cta whitespace-nowrap">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {testing ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </div>

        {message && (
          <div
            className="rounded-[10px] px-3 py-2 text-xs inline-flex items-start gap-2"
            style={{
              background: message.kind === 'ok' ? 'rgba(20,184,166,0.10)' : 'rgba(220,38,38,0.08)',
              color:      message.kind === 'ok' ? 'var(--teal)'             : 'var(--red)',
              border: `1px solid ${message.kind === 'ok' ? 'rgba(20,184,166,0.25)' : 'rgba(220,38,38,0.2)'}`,
            }}
          >
            {message.kind === 'ok' ? <CheckCircle2 size={13} className="mt-0.5" /> : <AlertCircle size={13} className="mt-0.5" />}
            <span>{message.text}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      {children}
    </div>
  );
}
