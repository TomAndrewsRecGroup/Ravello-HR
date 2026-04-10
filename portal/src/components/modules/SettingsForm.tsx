'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import {
  Loader2, CheckCircle2, Trash2,
  Briefcase, Palmtree, LifeBuoy, FileText,
  CalendarDays, ShieldCheck, ClipboardList, UserPlus,
} from 'lucide-react';
import { useUserPreferences } from '@/components/layout/UserPreferences';

// ── Shared ─────────────────────────────────────────────────────────────────────

function SavedBadge() {
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--teal)' }}>
      <CheckCircle2 size={12} /> Saved
    </span>
  );
}

// ── Company Profile ────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

const DEFAULT_OPEN_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_OPEN_HOURS = { start: '09:00', end: '17:30' };
const DEFAULT_TIMEZONE = 'Europe/London';
const DEFAULT_CURRENCY = 'GBP';

const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Lisbon',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Bucharest',
  'Europe/Athens',
  'Europe/Istanbul',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const CURRENCIES = [
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'USD', label: 'USD ($)' },
  { code: 'CAD', label: 'CAD (C$)' },
  { code: 'AUD', label: 'AUD (A$)' },
  { code: 'NZD', label: 'NZD (NZ$)' },
  { code: 'CHF', label: 'CHF (Fr)' },
  { code: 'SGD', label: 'SGD (S$)' },
  { code: 'HKD', label: 'HKD (HK$)' },
  { code: 'AED', label: 'AED (د.إ)' },
  { code: 'INR', label: 'INR (₹)' },
  { code: 'JPY', label: 'JPY (¥)' },
];

interface CompanyFormProps {
  company: {
    id: string;
    name: string;
    sector: string | null;
    size_band: string | null;
    contact_email: string | null;
    open_days?: string[] | null;
    open_hours?: { start: string; end: string } | null;
    timezone?: string | null;
    currency?: string | null;
  };
}

export function CompanyProfileForm({ company }: CompanyFormProps) {
  const supabase = createClient();
  const [form, setForm] = useState({
    name:          company.name ?? '',
    sector:        company.sector ?? '',
    size_band:     company.size_band ?? '',
    contact_email: company.contact_email ?? '',
  });
  const [openDays, setOpenDays] = useState<string[]>(
    company.open_days ?? DEFAULT_OPEN_DAYS,
  );
  const [openHours, setOpenHours] = useState<{ start: string; end: string }>(
    company.open_hours ?? DEFAULT_OPEN_HOURS,
  );
  const [timezone, setTimezone] = useState(
    company.timezone ?? DEFAULT_TIMEZONE,
  );
  const [currency, setCurrency] = useState(
    company.currency ?? DEFAULT_CURRENCY,
  );
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  function set(k: string, v: string) {
    setForm(p => ({ ...p, [k]: v }));
    setSaved(false);
  }

  function toggleDay(day: string) {
    setOpenDays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      }
      // maintain order
      return DAYS_OF_WEEK.map(d => d.key).filter(d => prev.includes(d) || d === day);
    });
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
        open_days:     openDays,
        open_hours:    openHours,
        timezone:      timezone,
        currency:      currency,
      })
      .eq('id', company.id);
    if (err) { setError(err.message); } else { setSaved(true); revalidatePortalPath('/settings'); }
    setLoading(false);
  }

  const SIZE_BANDS = ['1–10', '11–25', '26–50', '51–100', '101–250', '251–500', '500+'];

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="form-group">
        <label className="label">Company name</label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Sector</label>
          <input className="input" value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="e.g. Technology" />
        </div>
        <div className="form-group">
          <label className="label">Team size</label>
          <select className="input" value={form.size_band} onChange={e => set('size_band', e.target.value)}>
            <option value="">Select...</option>
            {SIZE_BANDS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="label">Contact email</label>
        <input className="input" type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--line)', margin: '8px 0' }} />

      {/* Open Days */}
      <div className="form-group">
        <label className="label">Open Days</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {DAYS_OF_WEEK.map(d => {
            const isActive = openDays.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: isActive ? 'var(--purple)' : 'var(--surface-alt)',
                  color: isActive ? '#fff' : 'var(--ink-soft)',
                  border: isActive ? 'none' : '1px solid var(--line)',
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Opening Hours */}
      <div className="form-group">
        <label className="label">Opening Hours</label>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="time"
            className="input"
            value={openHours.start}
            onChange={e => { setOpenHours(h => ({ ...h, start: e.target.value })); setSaved(false); }}
            style={{ maxWidth: 140 }}
          />
          <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>to</span>
          <input
            type="time"
            className="input"
            value={openHours.end}
            onChange={e => { setOpenHours(h => ({ ...h, end: e.target.value })); setSaved(false); }}
            style={{ maxWidth: 140 }}
          />
        </div>
      </div>

      {/* Timezone + Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Timezone</label>
          <select
            className="input"
            value={timezone}
            onChange={e => { setTimezone(e.target.value); setSaved(false); }}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Currency</label>
          <select
            className="input"
            value={currency}
            onChange={e => { setCurrency(e.target.value); setSaved(false); }}
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={loading} className="btn-cta btn-sm flex items-center gap-1.5">
          {loading && <Loader2 size={12} className="animate-spin" />}
          {loading ? 'Saving...' : 'Save Changes'}
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
    if (err) { setError(err.message); } else { setSaved(true); revalidatePortalPath('/settings'); }
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
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && <SavedBadge />}
      </div>
    </form>
  );
}

// ── Quick Actions Settings ────────────────────────────────────────────────────

const QUICK_ACTION_OPTIONS: { key: string; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'raise_role',          label: 'Raise a Role',          icon: Briefcase,      color: 'var(--purple)' },
  { key: 'log_leave',           label: 'Log Leave',             icon: Palmtree,       color: 'var(--success)' },
  { key: 'raise_ticket',        label: 'Raise a Ticket',        icon: LifeBuoy,       color: 'var(--amber)' },
  { key: 'upload_doc',          label: 'Upload Document',       icon: FileText,       color: 'var(--blue)' },
  { key: 'new_service_request', label: 'New Service Request',   icon: ClipboardList,  color: 'var(--teal)' },
  { key: 'view_compliance',     label: 'View Compliance',       icon: ShieldCheck,    color: 'var(--danger)' },
  { key: 'view_calendar',       label: 'View Calendar',         icon: CalendarDays,   color: '#6366F1' },
  { key: 'raise_internal_role', label: 'Raise Internal Role',   icon: UserPlus,       color: '#8B5CF6' },
];

export function QuickActionsSettings() {
  const { prefs, updatePrefs, loaded } = useUserPreferences();
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const activeKeys = prefs.quick_actions?.length > 0
    ? prefs.quick_actions
    : ['raise_role', 'log_leave', 'raise_ticket', 'upload_doc'];

  async function toggleAction(key: string) {
    setSaved(false);
    setSaving(true);
    const current = [...activeKeys];
    const idx = current.indexOf(key);
    if (idx >= 0) {
      if (current.length <= 1) { setSaving(false); return; }
      current.splice(idx, 1);
    } else {
      if (current.length >= 6) { setSaving(false); return; }
      current.push(key);
    }
    await updatePrefs({ quick_actions: current });
    setSaving(false);
    setSaved(true);
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ink-faint)' }} />
        <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>Loading preferences...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        Choose which actions appear in the floating quick-action button. Select 1 to 6 actions.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {QUICK_ACTION_OPTIONS.map(action => {
          const isActive = activeKeys.includes(action.key);
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => toggleAction(action.key)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
              style={{
                background: isActive ? 'var(--surface-soft)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--purple)' : 'var(--line)'}`,
              }}
            >
              <div
                className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
                style={{
                  borderColor: isActive ? 'var(--purple)' : 'var(--line)',
                  background: isActive ? 'var(--purple)' : 'transparent',
                }}
              >
                {isActive && <CheckCircle2 size={10} style={{ color: '#fff' }} />}
              </div>
              <Icon size={15} style={{ color: action.color, flexShrink: 0 }} />
              <span
                className="text-sm font-medium"
                style={{ color: isActive ? 'var(--ink)' : 'var(--ink-faint)' }}
              >
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 pt-1">
        {saving && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--ink-faint)' }} />}
        {saved && !saving && <SavedBadge />}
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {activeKeys.length}/6 actions selected
        </p>
      </div>
    </div>
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
  tps_admin:      'The People System Admin',
  tps_client:  'The People System Client',
};

export function TeamMembers({ members, currentUserId }: TeamMembersProps) {
  return (
    <div className="space-y-4">
      <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
        {members.map(m => {
          const isRavello = m.role.startsWith('tps_');
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
