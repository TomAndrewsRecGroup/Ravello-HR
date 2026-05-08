'use client';

import { useRef, useState } from 'react';
import { X, FileText, ExternalLink, Save } from 'lucide-react';
import { useModalShell } from '@/components/ui/useModalShell';
import AvatarInitials from '@/components/ui/AvatarInitials';
import { openAthleteCv } from './openCv';
import type { AthleteRow } from './types';

export interface ProfileNote {
  label: string;
  status: string;
  note: string;
}

interface Props {
  athlete: AthleteRow;
  notes: ProfileNote[];
  onClose: () => void;
  onSaved: (a: AthleteRow) => void;
}

// Admin athlete profile modal. Read-only view of everything The
// People System has on file plus an editable Phone field. Notes
// passed in are aggregated by AthletesClient from athlete_partner_
// interests + athlete_training_interests so admins can see (and
// review) every note they've left without leaving this card.
export default function AthleteProfileModal({ athlete, notes, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);

  const [phone, setPhone] = useState(athlete.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function savePhone() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/athletes/${athlete.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      onSaved({ ...athlete, phone: phone.trim() || null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
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
        className="card w-full max-w-2xl max-h-[92vh] flex flex-col p-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="athlete-profile-title"
      >
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <AvatarInitials name={athlete.full_name} size={36} />
          <div className="flex-1 min-w-0">
            <h2 id="athlete-profile-title" className="font-display text-lg font-semibold truncate" style={{ color: 'var(--ink)' }}>
              {athlete.full_name}
            </h2>
            <p className="text-xs truncate" style={{ color: 'var(--ink-soft)' }}>
              {[athlete.sport, athlete.previous_role, athlete.company_name].filter(Boolean).join(' · ') || 'Athlete'}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon btn-ghost"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-md p-2 text-xs" style={{ background: 'rgba(217,68,68,0.05)', color: 'var(--red)', border: '1px solid var(--red)' }}>
              {error}
            </div>
          )}

          {notes.length > 0 && (
            <div
              className="rounded-md p-3 space-y-2"
              style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.18)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--purple)' }}>
                Notes you&apos;ve left
              </p>
              <ul className="space-y-1.5">
                {notes.map((n, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{n.label}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{n.status}</span>
                    <p style={{ color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{n.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Email">{athlete.email ?? '—'}</Field>
            <div>
              <p className="label">Phone</p>
              <div className="flex items-center gap-2">
                <input className="input flex-1" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7…" />
                <button type="button" className="btn-cta btn-sm" onClick={savePhone} disabled={saving}>
                  <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <Field label="Sport">{athlete.sport ?? '—'}</Field>
            <Field label="Previous role">{athlete.previous_role ?? '—'}</Field>
          </div>

          {athlete.linkedin_url && (
            <Field label="LinkedIn">
              <a href={athlete.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--purple)' }}>
                {athlete.linkedin_url} <ExternalLink size={11} />
              </a>
            </Field>
          )}

          {athlete.bio && (
            <Field label="Bio">
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{athlete.bio}</p>
            </Field>
          )}

          {(athlete.cv_kind === 'file' || athlete.cv_kind === 'text') && (
            <Field label="CV">
              {athlete.cv_kind === 'file' ? (
                <button
                  type="button"
                  onClick={() => openAthleteCv(athlete.id)}
                  className="inline-flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--purple)', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                  title="Open CV (signed link valid for 1 hour)"
                >
                  <FileText size={12} /> {athlete.cv_filename ?? 'Open CV'} <ExternalLink size={11} />
                </button>
              ) : (
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{athlete.cv_text ?? ''}</p>
              )}
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="text-sm" style={{ color: 'var(--ink)' }}>{children}</div>
    </div>
  );
}
