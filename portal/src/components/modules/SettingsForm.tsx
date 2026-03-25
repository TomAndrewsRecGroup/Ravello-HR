'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, Trash2 } from 'lucide-react';

// ── Shared ─────────────────────────────────────────────────────────────────────

function SavedBadge() {
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--teal)' }}>
      <CheckCircle2 size={12} /> Saved
    </span>
  );
}

// ── Company Profile ────────────────────────────────────────────────────────────

interface CompanyFormProps {
  company: {
    id: string;
    name: string;
    sector: string | null;
    size_band: string | null;
    contact_email: string | null;
    website?: string | null;
  };
}

export function CompanyProfileForm({ company }: CompanyFormProps) {
  const supabase = createClient();
  const [form, setForm] = useState({
    name:          company.name ?? '',
    sector:        company.sector ?? '',
    size_band:     company.size_band ?? '',
    contact_email: company.contact_email ?? '',
    website:       (company as any).website ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  function set(k: string, v: string) {
    setForm(p => ({ ...p, [k]: v }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: err } = await supabase
      .from('companies')
      .update({
        name:          form.name,
        sector:        form.sector || null,
        size_band:     form.size_band || null,
        contact_email: form.contact_email || null,
      })
      .eq('id', company.id);
    if (err) { setError(err.message); } else { setSaved(true); }
    setLoading(false);
  }

  const SIZE_BANDS = ['1–10', '11–25', '26–50', '51–100', '101–250', '251–500', '500+'];

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="form-group">
        <label className="label">Company name</label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Sector</label>
          <input className="input" value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="e.g. Technology" />
        </div>
        <div className="form-group">
          <label className="label">Team size</label>
          <select className="input" value={form.size_band} onChange={e => set('size_band', e.target.value)}>
            <option value="">Select…</option>
            {SIZE_BANDS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="label">Contact email</label>
        <input className="input" type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
      </div>
      {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={loading} className="btn-cta btn-sm flex items-center gap-1.5">
          {loading && <Loader2 size={12} className="animate-spin" />}
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <SavedBadge />}
      </div>
    </form>
  );
}

// ── Your Profile ───────────────────────────────────────────────────────────────

interface ProfileFormProps {
  profile: { id: string; full_name: string | null };
  email: string;
}

export function YourProfileForm({ profile, email }: ProfileFormProps) {
  const supabase = createClient();
  const [name,    setName]    = useState(profile.full_name ?? '');
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: name })
      .eq('id', profile.id);
    if (err) { setError(err.message); } else { setSaved(true); }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="form-group">
        <label className="label">Full name</label>
        <input
          className="input"
          value={name}
          onChange={e => { setName(e.target.value); setSaved(false); }}
        />
      </div>
      <div className="form-group">
        <label className="label">Email</label>
        <input
          className="input"
          value={email}
          readOnly
          style={{ cursor: 'default', background: 'var(--surface-alt)' }}
        />
        <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Email cannot be changed here.</p>
      </div>
      {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={loading} className="btn-cta btn-sm flex items-center gap-1.5">
          {loading && <Loader2 size={12} className="animate-spin" />}
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <SavedBadge />}
      </div>
    </form>
  );
}

// ── Team Members ───────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface TeamMembersProps {
  members: TeamMember[];
  currentUserId: string;
}

const ROLE_LABELS: Record<string, string> = {
  client_admin:   'Admin',
  client_user:    'Member',
  ravello_admin:  'Ravello Admin',
  ravello_staff:  'Ravello Staff',
};

export function TeamMembers({ members, currentUserId }: TeamMembersProps) {
  return (
    <div className="space-y-4">
      <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
        {members.map(m => {
          const isRavello = m.role.startsWith('ravello_');
          const isYou     = m.id === currentUserId;
          return (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                style={{ background: 'var(--purple)' }}
              >
                {(m.full_name ?? m.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {m.full_name ?? m.email}
                  {isYou && <span className="ml-1 text-xs" style={{ color: 'var(--ink-faint)' }}>(you)</span>}
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{m.email}</p>
              </div>
              <span
                className={`badge ${isRavello ? 'badge-inprogress' : 'badge-normal'}`}
                style={{ flexShrink: 0 }}
              >
                {ROLE_LABELS[m.role] ?? m.role}
              </span>
              {!isRavello && !isYou && (
                <button
                  type="button"
                  disabled
                  className="btn-icon opacity-30"
                  title="Contact The People Office to remove team members"
                  aria-label="Remove"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="rounded-[10px] p-4 text-sm"
        style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}
      >
        To add team members, contact{' '}
        <a href="mailto:hello@thepeopleoffice.co.uk" style={{ color: 'var(--purple)' }}>
          The People Office
        </a>
        .
      </div>
    </div>
  );
}

// ── Notification Preferences ──────────────────────────────────────────────────

const NOTIF_OPTIONS = [
  { key: 'new_candidates',   label: 'Email me when new candidates are added'   },
  { key: 'friction_alerts',  label: 'Email me when a Friction Alert is raised'  },
  { key: 'weekly_reminders', label: 'Weekly action reminders'                   },
] as const;

type NotifKey = typeof NOTIF_OPTIONS[number]['key'];

const STORAGE_KEY = 'tpo_notification_prefs';

export function NotificationPrefs() {
  const [prefs, setPrefs] = useState<Record<NotifKey, boolean>>({
    new_candidates:   true,
    friction_alerts:  true,
    weekly_reminders: true,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPrefs(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  function toggle(key: NotifKey) {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    setSaved(true);
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      {NOTIF_OPTIONS.map(o => (
        <label key={o.key} className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs[o.key]}
            onChange={() => toggle(o.key)}
            className="w-4 h-4 rounded accent-purple-600"
          />
          <span className="text-sm" style={{ color: 'var(--ink)' }}>{o.label}</span>
        </label>
      ))}
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="btn-secondary btn-sm">
          Save Preferences
        </button>
        {saved && <SavedBadge />}
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Saved locally — full email preferences coming soon.
      </p>
    </form>
  );
}
