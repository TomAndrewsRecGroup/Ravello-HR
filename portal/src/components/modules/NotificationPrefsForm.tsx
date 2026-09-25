'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check } from 'lucide-react';
import { EMAIL_MODES, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, type EmailMode, type NotificationType } from '@/lib/notify/types';

// Notification preferences, stored in notification_preferences (096)
// and read by the notification engine before every email. The previous
// panel saved three checkboxes to localStorage and nothing read them.

export interface PrefsInitial {
  email_mode:     EmailMode;
  muted_types:    string[];
  weekly_summary: boolean;
}

interface Props {
  userId:  string;
  initial: PrefsInitial;
  /** Which types to offer muting for (the ones this app's users receive). */
  types?:  readonly NotificationType[];
}

const MODE_LABELS: Record<EmailMode, { label: string; hint: string }> = {
  immediate: { label: 'Email me as things happen', hint: 'One email per notification.' },
  daily:     { label: 'One daily summary',           hint: 'Everything unread, each morning. Urgent items still come at once.' },
  off:       { label: 'In-app only',                 hint: 'No email; the bell still shows everything.' },
};

export default function NotificationPrefsForm({ userId, initial, types = NOTIFICATION_TYPES }: Props) {
  const supabase = createClient();
  const [mode, setMode] = useState<EmailMode>(initial.email_mode);
  const [muted, setMuted] = useState<Set<string>>(new Set(initial.muted_types));
  const [weekly, setWeekly] = useState(initial.weekly_summary);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMute(t: string) {
    setMuted(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    const { error: err } = await supabase.from('notification_preferences').upsert({
      user_id: userId, email_mode: mode, muted_types: [...muted], weekly_summary: weekly, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-soft)' }}>Email</legend>
        {EMAIL_MODES.map(m => (
          <label key={m} className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="email_mode" value={m} checked={mode === m} onChange={() => { setMode(m); setSaved(false); }} className="mt-1" />
            <span>
              <span className="block text-sm" style={{ color: 'var(--ink)' }}>{MODE_LABELS[m].label}</span>
              <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{MODE_LABELS[m].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={weekly} onChange={() => { setWeekly(w => !w); setSaved(false); }} className="w-4 h-4 rounded" />
        <span className="text-sm" style={{ color: 'var(--ink)' }}>Weekly summary email</span>
      </label>

      <details>
        <summary className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--ink-soft)' }}>
          Mute specific notifications{muted.size > 0 ? ` (${muted.size} muted)` : ''}
        </summary>
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          {types.map(t => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!muted.has(t)} onChange={() => toggleMute(t)} className="w-4 h-4 rounded" />
              <span className="text-xs" style={{ color: 'var(--ink)' }}>{NOTIFICATION_TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--ink-faint)' }}>Muted notifications are not emailed; they still appear in the bell.</p>
      </details>

      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={saving} className="btn-secondary btn-sm">{saving ? 'Saving…' : 'Save preferences'}</button>
        {saved && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--success)' }}><Check size={12} /> Saved</span>}
      </div>
    </form>
  );
}
