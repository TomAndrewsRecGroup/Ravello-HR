'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle2, Clock, ExternalLink, Eye, Mail, RefreshCw, Send, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { useToast } from '@/components/modules/Toast';
import { A2I_TEST_EXTRA_ADDRESS } from '@/lib/a2iRoles/recipients';

export interface RolesEmailData {
  config: {
    enabled: boolean;
    recipient_mode: 'all' | 'selected';
    sender_profile_id: string | null;
    role_url_template: string;
    notify_email: string;
    updated_at: string;
  } | null;
  nextSend: string;
  athletes: Array<{ id: string; full_name: string; email: string | null; company_name: string | null }>;
  selectedIds: string[];
  optouts: Array<{ email_lower: string; source: string; created_at: string }>;
  sends: Array<{
    id: string; week_key: string; status: string; trigger: string; job_count: number; recipient_count: number;
    sent_count: number; failed_count: number; sender_email: string | null; error: string | null;
    started_at: string | null; completed_at: string | null; created_at: string;
  }>;
  interests: Array<{
    id: string; manatal_job_id: string; position_name: string; note: string | null; notified_at: string | null;
    notify_error: string | null; created_at: string; athlete_name: string | null; athlete_email: string | null;
  }>;
  senders: Array<{ id: string; label: string; configured: boolean; last_verified_at: string | null }>;
  loadError: string | null;
}

interface PreviewRole {
  id: string; title: string; location: string | null; contract: string | null; salary: string | null;
  industry: string | null; clientName: string | null; url: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Starting', sending: 'Sending', complete: 'Sent', no_roles: 'No live roles', failed: 'Failed',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/a2i-roles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.ok !== false, json };
}

export default function RolesEmailClient({ data }: { data: RolesEmailData }) {
  const router = useRouter();
  const { toast } = useToast();
  const cfg = data.config;

  const [enabled, setEnabled] = useState(cfg?.enabled ?? false);
  const [mode, setMode] = useState<'all' | 'selected'>(cfg?.recipient_mode ?? 'all');
  const [senderId, setSenderId] = useState(cfg?.sender_profile_id ?? '');
  const [template, setTemplate] = useState(cfg?.role_url_template ?? '');
  const [notifyEmail, setNotifyEmail] = useState(cfg?.notify_email ?? '');
  const [selected, setSelected] = useState(() => new Set(data.selectedIds));
  const [optedOut, setOptedOut] = useState(() => new Set(data.optouts.map(o => o.email_lower)));
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string; roles: PreviewRole[]; recipients: number | null } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const recipientCount = useMemo(() => {
    const seen = new Set<string>();
    for (const a of data.athletes) {
      const e = a.email?.trim().toLowerCase();
      if (!e || optedOut.has(e) || seen.has(e)) continue;
      if (mode === 'selected' && !selected.has(a.id)) continue;
      seen.add(e);
    }
    return seen.size;
  }, [data.athletes, optedOut, selected, mode]);

  if (!cfg) {
    return (
      <div className="card p-5">
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          The role email settings could not be loaded{data.loadError ? `: ${data.loadError}` : '.'}
        </p>
      </div>
    );
  }

  const thisWeek = data.sends[0];

  async function saveConfig(patch: Record<string, unknown>, label: string) {
    setBusy(label);
    const { ok, json } = await post({ action: 'save_config', ...patch });
    setBusy(null);
    if (!ok) { toast(json.error ?? 'Could not save', 'error'); return false; }
    toast('Saved', 'success');
    router.refresh();
    return true;
  }

  async function toggleEnabled() {
    const next = !enabled;
    if (next && recipientCount === 0) { toast('No athletes would receive it — check the recipient list first.', 'error'); return; }
    if (await saveConfig({ enabled: next }, 'enabled')) setEnabled(next);
  }

  async function changeMode(next: 'all' | 'selected') {
    if (await saveConfig({ recipient_mode: next }, 'mode')) setMode(next);
  }

  async function toggleSelected(id: string) {
    const isOn = selected.has(id);
    setBusy(`sel-${id}`);
    const { ok, json } = await post({ action: 'set_recipient', athlete_id: id, selected: !isOn });
    setBusy(null);
    if (!ok) { toast(json.error ?? 'Could not update', 'error'); return; }
    setSelected(prev => { const s = new Set(prev); if (isOn) s.delete(id); else s.add(id); return s; });
  }

  async function toggleOptout(id: string, email: string) {
    const lower = email.trim().toLowerCase();
    const isOut = optedOut.has(lower);
    if (isOut && !window.confirm(`Re-subscribe ${email}? Only do this if they have asked to receive the weekly role emails again.`)) return;
    setBusy(`opt-${id}`);
    const { ok, json } = await post({ action: 'set_optout', athlete_id: id, opted_out: !isOut });
    setBusy(null);
    if (!ok) { toast(json.error ?? 'Could not update', 'error'); return; }
    setOptedOut(prev => { const s = new Set(prev); if (isOut) s.delete(lower); else s.add(lower); return s; });
    toast(isOut ? 'Re-subscribed' : 'Opted out', 'success');
  }

  async function loadPreview() {
    setBusy('preview');
    setPreviewError(null);
    const res = await fetch('/api/admin/a2i-roles/preview');
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setPreviewError(json.error ?? 'Could not load the preview'); return; }
    setPreview(json);
  }

  async function verify() {
    setBusy('verify');
    const { ok, json } = await post({ action: 'verify_smtp' });
    setBusy(null);
    toast(ok ? `SMTP login works for ${json.from}` : `SMTP login failed: ${json.error}`, ok ? 'success' : 'error');
    if (ok) router.refresh();
  }

  async function sendTest() {
    setBusy('test');
    const { ok, json } = await post({ action: 'test' });
    setBusy(null);
    if (!ok) { toast(json.error ?? 'Test failed', 'error'); return; }
    const sentTo = (json.to as string[]).join(' and ');
    const failed = (json.failed ?? []) as Array<{ to: string; error: string | null }>;
    toast(
      failed.length === 0
        ? `Test sent to ${sentTo} (${json.roles} roles)`
        : `Test sent to ${sentTo}, but not to ${failed.map(f => f.to).join(', ')}: ${failed[0].error ?? 'send failed'}`,
      failed.length === 0 ? 'success' : 'error',
    );
  }

  async function sendNow(action: 'send_now' | 'retry_failed') {
    const msg = action === 'send_now'
      ? `Send this week's roles email now to ${recipientCount} athlete${recipientCount === 1 ? '' : 's'}? It will not go out again on Thursday this week.`
      : 'Retry everyone this week’s email failed to reach?';
    if (!window.confirm(msg)) return;
    setBusy(action);
    const { ok, json } = await post({ action, confirm: true });
    setBusy(null);
    if (!ok) { toast(json.error ?? 'Send failed', 'error'); router.refresh(); return; }
    const t = json.tally ?? {};
    toast(`${t.sent_this_run ?? 0} sent${t.failed_this_run ? `, ${t.failed_this_run} failed` : ''}${t.remaining ? `, ${t.remaining} still to send` : ''}`, t.failed_this_run ? 'error' : 'success');
    router.refresh();
  }

  const sender = data.senders.find(s => s.id === senderId);

  return (
    <div className="space-y-6">
      {/* ── Status & settings ── */}
      <section className="card p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <Mail size={16} style={{ color: 'var(--purple)' }} className="mt-0.5" />
            <div>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Weekly email</h2>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                {enabled
                  ? <>Next send: <strong>{data.nextSend}</strong> to {recipientCount} athlete{recipientCount === 1 ? '' : 's'}.</>
                  : 'Switched off. Nothing will be sent until you turn it on.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={enabled ? 'btn-secondary btn-sm' : 'btn-cta btn-sm'}
            onClick={toggleEnabled}
            disabled={busy !== null}
            aria-pressed={enabled}
          >
            {enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="sender">Sent from</label>
            <select id="sender" className="input" value={senderId} onChange={e => setSenderId(e.target.value)}>
              <option value="">Choose a sender…</option>
              {data.senders.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              Uses that person&rsquo;s own SMTP from Settings → Email.
              {sender?.last_verified_at ? ` Last verified ${fmt(sender.last_verified_at)}.` : ''}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="notify">Match me requests go to</label>
            <input id="notify" className="input" type="email" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="tpl">Role page link</label>
            <input id="tpl" className="input" value={template} onChange={e => setTemplate(e.target.value)} />
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              <code>{'{id}'}</code> is replaced with the Manatal job ID.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button" className="btn-cta btn-sm" disabled={busy !== null}
            onClick={() => saveConfig({
              sender_profile_id: senderId || null, role_url_template: template.trim(), notify_email: notifyEmail.trim(),
            }, 'settings')}
          >
            {busy === 'settings' ? 'Saving…' : 'Save settings'}
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={verify} disabled={busy !== null || !cfg.sender_profile_id}>
            <ShieldCheck size={14} /> {busy === 'verify' ? 'Checking…' : 'Verify SMTP login'}
          </button>
        </div>
      </section>

      {/* ── This week ── */}
      <section className="card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Eye size={16} style={{ color: 'var(--purple)' }} className="mt-0.5" />
            <div>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>This week&rsquo;s roles</h2>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                Pulled live from Manatal (active and published). Client names are shown here only — never in the email.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={loadPreview} disabled={busy !== null}>
              <RefreshCw size={14} /> {busy === 'preview' ? 'Loading…' : preview ? 'Refresh' : 'Load preview'}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={sendTest}
              disabled={busy !== null}
              title={`Sends a test to your own address and to ${A2I_TEST_EXTRA_ADDRESS}. No athlete receives it.`}
            >
              <Sparkles size={14} /> {busy === 'test' ? 'Sending…' : 'Send test to me'}
            </button>
            <button type="button" className="btn-cta btn-sm" onClick={() => sendNow('send_now')} disabled={busy !== null || recipientCount === 0}>
              <Send size={14} /> {busy === 'send_now' ? 'Sending…' : 'Send now'}
            </button>
            {thisWeek && thisWeek.failed_count > 0 && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => sendNow('retry_failed')} disabled={busy !== null}>
                <RefreshCw size={14} /> Retry failed
              </button>
            )}
          </div>
        </div>

        {previewError && (
          <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={14} /> {previewError}
          </p>
        )}

        {preview && (
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {preview.roles.length} live role{preview.roles.length === 1 ? '' : 's'} · would go to {preview.recipients ?? '?'} athlete{preview.recipients === 1 ? '' : 's'}
              </p>
              <ul className="space-y-2">
                {preview.roles.map(r => (
                  <li key={r.id} className="rounded-lg p-3" style={{ border: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.title}</p>
                        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                          {[r.location, r.contract, r.salary].filter(Boolean).join(' · ') || '—'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                          Manatal #{r.id}{r.clientName ? ` · Client: ${r.clientName} (internal)` : ''}
                        </p>
                      </div>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn-icon" aria-label={`Open ${r.title} on andrews-recruitment.com`}>
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--ink-faint)' }}>Subject: {preview.subject}</p>
              <iframe
                title="Email preview"
                srcDoc={preview.html}
                sandbox=""
                className="w-full rounded-lg"
                style={{ height: 640, border: '1px solid var(--line)', background: '#060a18' }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Recipients ── */}
      <section className="card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Users size={16} style={{ color: 'var(--purple)' }} className="mt-0.5" />
            <div>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Who gets it</h2>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                Only athletes on the Athletes To Industry list can ever receive this email. Each person gets their own copy.
              </p>
            </div>
          </div>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface-soft)' }} role="radiogroup" aria-label="Recipients">
            {(['all', 'selected'] as const).map(m => (
              <button
                key={m} type="button" role="radio" aria-checked={mode === m}
                className="btn-sm rounded-md px-3"
                style={{ background: mode === m ? 'var(--surface)' : 'transparent', color: mode === m ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: mode === m ? 600 : 400 }}
                onClick={() => mode !== m && changeMode(m)} disabled={busy !== null}
              >
                {m === 'all' ? 'All athletes' : 'Selected athletes'}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {recipientCount} will receive it{mode === 'selected' ? ` (${selected.size} selected)` : ''} · {optedOut.size} opted out
        </p>

        <ul className="divide-y" style={{ borderTop: '1px solid var(--line)' }}>
          {data.athletes.map(a => {
            const email = a.email?.trim() ?? '';
            const out = email ? optedOut.has(email.toLowerCase()) : false;
            const isSel = selected.has(a.id);
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5" style={{ borderColor: 'var(--line)' }}>
                {mode === 'selected' && (
                  <input
                    type="checkbox" checked={isSel} disabled={busy !== null || !email || out}
                    onChange={() => toggleSelected(a.id)} aria-label={`Send to ${a.full_name}`}
                    className="h-4 w-4"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{a.full_name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--ink-faint)' }}>
                    {email || 'No email'}{a.company_name ? ` · ${a.company_name}` : ''}
                  </p>
                </div>
                {out && <span className="badge badge-inactive">Opted out</span>}
                {email && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => toggleOptout(a.id, email)} disabled={busy !== null}>
                    {out ? 'Re-subscribe' : 'Opt out'}
                  </button>
                )}
              </li>
            );
          })}
          {data.athletes.length === 0 && (
            <li className="py-4 text-sm" style={{ color: 'var(--ink-faint)' }}>No athletes yet.</li>
          )}
        </ul>
      </section>

      {/* ── Match me requests ── */}
      <section className="card p-5 space-y-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={16} style={{ color: 'var(--purple)' }} className="mt-0.5" />
          <div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Match me requests</h2>
            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Each one also emails {cfg.notify_email}.</p>
          </div>
        </div>
        {data.interests.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderTop: '1px solid var(--line)' }}>
            {data.interests.map(i => (
              <li key={i.id} className="py-2.5" style={{ borderColor: 'var(--line)' }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>
                    <strong>{i.athlete_name ?? 'Athlete'}</strong>{' → '}
                    <a href={template.split('{id}').join(i.manatal_job_id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--purple)' }}>
                      {i.position_name}
                    </a>
                  </p>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{fmt(i.created_at)}</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  {i.athlete_email}{' · '}
                  {i.notified_at ? 'Emailed' : i.notify_error ? <span style={{ color: 'var(--danger)' }}>Email failed: {i.notify_error}</span> : 'Not emailed'}
                </p>
                {i.note && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>&ldquo;{i.note}&rdquo;</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── History ── */}
      <section className="card p-5 space-y-3">
        <div className="flex items-start gap-2">
          <Clock size={16} style={{ color: 'var(--purple)' }} className="mt-0.5" />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Sent so far</h2>
        </div>
        {data.sends.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Nothing has been sent yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderTop: '1px solid var(--line)' }}>
            {data.sends.map(s => (
              <li key={s.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ borderColor: 'var(--line)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{s.week_key}</span>
                <span className={`badge ${s.status === 'complete' ? 'badge-resolved' : s.status === 'failed' ? 'badge-urgent' : 'badge-inprogress'}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {s.job_count} roles · {s.sent_count} sent{s.failed_count ? ` · ${s.failed_count} failed` : ''}
                  {s.trigger === 'manual' ? ' · sent by hand' : ''}
                </span>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{fmt(s.completed_at ?? s.started_at ?? s.created_at)}</span>
                {s.error && <p className="w-full text-xs" style={{ color: 'var(--danger)' }}>{s.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
