'use client';

import { useRef, useState } from 'react';
import { X, Loader2, FileText, Type as TypeIcon, Upload, Trash2 } from 'lucide-react';
import { useModalShell } from '@/components/ui/useModalShell';
import { CV_EXT_ALLOW, CV_MAX_BYTES } from '@/lib/athletes/validate';
import type { AthleteRow } from './types';

type Mode = 'create' | 'edit';

interface Props {
  mode: Mode;
  athlete?: AthleteRow;
  onClose: () => void;
  onSaved: (saved: AthleteRow, openMatch: boolean) => void;
}

const ACCEPT = '.pdf,.doc,.docx,.txt';

export default function AthleteFormModal({ mode, athlete, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalShell(true, onClose, dialogRef);

  const [fullName, setFullName] = useState(athlete?.full_name ?? '');
  const [email, setEmail] = useState(athlete?.email ?? '');
  const [sport, setSport] = useState(athlete?.sport ?? '');
  const [previousRole, setPreviousRole] = useState(athlete?.previous_role ?? '');
  const [bio, setBio] = useState(athlete?.bio ?? '');
  const [linkedinUrl, setLinkedinUrl] = useState(athlete?.linkedin_url ?? '');

  const [cvKind, setCvKind] = useState<'file' | 'text' | null>(athlete?.cv_kind ?? null);
  const [cvText, setCvText] = useState(athlete?.cv_text ?? '');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [existingCv, setExistingCv] = useState<{ url: string; name: string } | null>(
    athlete?.cv_kind === 'file' && athlete.cv_url
      ? { url: athlete.cv_url, name: athlete.cv_filename ?? 'CV' }
      : null,
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function pickCvFile(file: File | null) {
    setError('');
    if (!file) { setCvFile(null); return; }
    const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    if (!CV_EXT_ALLOW.has(ext)) {
      setError(`File type .${ext} not supported. Use PDF, DOC, DOCX or TXT.`);
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setError('File exceeds 10 MB.');
      return;
    }
    setCvFile(file);
    setCvKind('file');
  }

  async function save(thenMatch: boolean) {
    if (!fullName.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');

    const body: Record<string, unknown> = {
      full_name: fullName.trim(),
      email: email.trim() || null,
      sport: sport.trim() || null,
      previous_role: previousRole.trim() || null,
      bio: bio.trim() || null,
      linkedin_url: linkedinUrl.trim() || null,
    };
    if (cvKind === 'text') {
      body.cv_kind = 'text';
      body.cv_text = cvText.trim() || null;
    } else if (cvKind === null && (athlete?.cv_kind ?? null) !== null && !cvFile) {
      body.cv_kind = null;
      body.cv_text = null;
    }

    try {
      const res = await fetch(
        mode === 'create' ? '/api/athletes' : `/api/athletes/${athlete!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');

      let saved: AthleteRow = json.row as AthleteRow;
      if (!saved?.id) throw new Error('Server did not return saved row');

      // Upload CV file if provided. The CV route returns the updated row,
      // which supersedes the row from the create/patch.
      if (cvFile) {
        const fd = new FormData();
        fd.append('file', cvFile);
        const upRes = await fetch(`/api/athletes/${saved.id}/cv`, { method: 'POST', body: fd });
        const upJson = await upRes.json();
        if (!upRes.ok) throw new Error(upJson.error ?? 'CV upload failed');
        if (upJson.row) saved = upJson.row as AthleteRow;
      }

      onSaved(saved, thenMatch);
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
        role="dialog" aria-modal="true" aria-labelledby="athlete-form-title"
      >
        <div className="px-6 py-5 flex items-center" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 id="athlete-form-title" className="font-display text-lg font-semibold flex-1" style={{ color: 'var(--ink)' }}>
            {mode === 'create' ? 'Add an athlete' : `Edit ${athlete?.full_name}`}
          </h2>
          <button onClick={onClose} className="btn-icon btn-ghost"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full name" required>
              <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Sarah Mitchell" />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@example.com" />
            </Field>
            <Field label="Sport">
              <input className="input" value={sport} onChange={e => setSport(e.target.value)} placeholder="Rugby" />
            </Field>
            <Field label="Previous role">
              <input className="input" value={previousRole} onChange={e => setPreviousRole(e.target.value)} placeholder="Fly-half, Harlequins" />
            </Field>
          </div>

          <Field label="LinkedIn URL">
            <input className="input" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
          </Field>

          <Field label="Short bio">
            <textarea className="input" rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="Quick summary, transferable strengths, what they're looking for next." />
          </Field>

          {/* CV section */}
          <div>
            <p className="label">CV</p>
            <div className="flex gap-2 mb-3">
              <CvKindButton active={cvKind === 'file'} onClick={() => setCvKind('file')} icon={<Upload size={12} />} label="Upload file" />
              <CvKindButton active={cvKind === 'text'} onClick={() => setCvKind('text')} icon={<TypeIcon size={12} />} label="Paste text" />
              {cvKind && (
                <button type="button" onClick={() => { setCvKind(null); setCvFile(null); setExistingCv(null); }}
                        className="btn-ghost btn-sm" style={{ fontSize: 11 }}>
                  Clear
                </button>
              )}
            </div>

            {cvKind === 'file' && (
              <div>
                {existingCv && !cvFile && (
                  <div className="rounded-[10px] p-3 mb-2 flex items-center gap-2" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
                    <FileText size={14} style={{ color: 'var(--purple)' }} />
                    <a href={existingCv.url} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline flex-1 truncate" style={{ color: 'var(--ink)' }}>
                      {existingCv.name}
                    </a>
                    <button type="button" onClick={() => setExistingCv(null)} className="btn-icon btn-ghost" style={{ width: 24, height: 24, color: 'var(--red)' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
                <label
                  className="block rounded-[10px] p-4 text-center cursor-pointer hover:bg-[var(--surface-alt)]"
                  style={{ border: '1.5px dashed var(--line)' }}
                >
                  <Upload size={18} className="mx-auto mb-1.5" style={{ color: 'var(--ink-faint)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                    {cvFile ? cvFile.name : 'Click to upload CV'}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                    PDF, DOC, DOCX or TXT — up to 10 MB
                  </p>
                  <input
                    type="file"
                    accept={ACCEPT}
                    onChange={e => pickCvFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {cvKind === 'text' && (
              <textarea
                className="input"
                rows={8}
                value={cvText}
                onChange={e => setCvText(e.target.value)}
                placeholder="Paste the CV text here…"
              />
            )}
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>
          )}
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          {mode === 'create' && (
            <button onClick={() => save(true)} disabled={saving} className="btn-secondary btn-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              Save & match
            </button>
          )}
          <button onClick={() => save(false)} disabled={saving} className="btn-cta btn-sm flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            {mode === 'create' ? 'Save athlete' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function CvKindButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold"
      style={{
        background: active ? 'var(--purple)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-soft)',
        border: `1px solid ${active ? 'var(--purple)' : 'var(--line)'}`,
      }}
    >
      {icon} {label}
    </button>
  );
}
