'use client';

import { useRef, useState, type FormEvent } from 'react';
import { CV_EXT_ALLOW, CV_MAX_BYTES } from '@/lib/athletes/validate';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type CvKind = 'file' | 'text' | null;

const ACCEPT = '.pdf,.doc,.docx,.txt';

export default function AthleteReferralForm({ slug }: { slug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cvKind, setCvKind] = useState<CvKind>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState('');

  function pickFile(file: File | null) {
    setErrorMsg('');
    if (!file) { setCvFile(null); return; }
    const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    if (!CV_EXT_ALLOW.has(ext)) {
      setErrorMsg(`File type .${ext} not supported. Use PDF, DOC, DOCX or TXT.`);
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setErrorMsg('File exceeds 10 MB.');
      return;
    }
    setCvFile(file);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    const form = e.currentTarget;

    // Named text inputs (incl. the honeypot) come straight off the form;
    // the CV rides along based on the chosen mode.
    const fd = new FormData(form);
    if (cvKind === 'file' && cvFile) {
      fd.append('file', cvFile);
    } else if (cvKind === 'text' && cvText.trim()) {
      fd.append('cv_kind', 'text');
      fd.append('cv_text', cvText.trim());
    }

    if (!String(fd.get('full_name')).trim()) {
      setStatus('error');
      setErrorMsg('Your name is required.');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/r/athlete/${slug}`, { method: 'POST', body: fd });
      if (res.ok) {
        setStatus('success');
        form.reset();
        setCvKind(null);
        setCvFile(null);
        setCvText('');
      } else {
        const json = await res.json().catch(() => ({}));
        setStatus('error');
        setErrorMsg(json.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col gap-4">
        <p className="a2i-section-label">Registered</p>
        <h2 className="a2i-display" style={{ fontSize: 26 }}>Thank you.</h2>
        <p className="a2i-prose" style={{ fontSize: 15 }}>
          Your details are in. The team at Andrews Recruitment Group will reach out shortly. Keep an
          eye on your inbox for a welcome email with your next steps.
        </p>
        <div className="mt-2">
          <button type="button" className="a2i-btn a2i-btn-ghost" onClick={() => setStatus('idle')}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/* Honeypot */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-6">
        <div>
          <label htmlFor="full_name" className="a2i-label">Full name *</label>
          <input id="full_name" name="full_name" type="text" required autoComplete="name" className="a2i-field" placeholder="Sarah Mitchell" />
        </div>
        <div>
          <label htmlFor="email" className="a2i-label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className="a2i-field" placeholder="sarah@example.com" />
        </div>
        <div>
          <label htmlFor="phone" className="a2i-label">Phone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className="a2i-field" placeholder="+44 7…" />
        </div>
        <div>
          <label htmlFor="sport" className="a2i-label">Sport</label>
          <input id="sport" name="sport" type="text" className="a2i-field" placeholder="Rugby" />
        </div>
        <div>
          <label htmlFor="previous_role" className="a2i-label">Previous role</label>
          <input id="previous_role" name="previous_role" type="text" className="a2i-field" placeholder="Fly-half, Harlequins" />
        </div>
        <div>
          <label htmlFor="linkedin_url" className="a2i-label">LinkedIn URL</label>
          <input id="linkedin_url" name="linkedin_url" type="url" className="a2i-field" placeholder="https://linkedin.com/in/…" />
        </div>
      </div>

      <div>
        <label htmlFor="bio" className="a2i-label">Short bio</label>
        <textarea id="bio" name="bio" rows={3} className="a2i-field" placeholder="Quick summary, transferable strengths, what you're looking for next." />
      </div>

      {/* CV */}
      <div>
        <span className="a2i-label">CV</span>
        <div className="flex gap-3 mb-3 flex-wrap">
          <button type="button" onClick={() => setCvKind('file')}
            className="a2i-btn a2i-btn-ghost" style={{ padding: '8px 16px', fontSize: 11, opacity: cvKind === 'file' ? 1 : 0.6 }}>
            Upload file
          </button>
          <button type="button" onClick={() => setCvKind('text')}
            className="a2i-btn a2i-btn-ghost" style={{ padding: '8px 16px', fontSize: 11, opacity: cvKind === 'text' ? 1 : 0.6 }}>
            Paste text
          </button>
          {cvKind && (
            <button type="button" onClick={() => { setCvKind(null); setCvFile(null); setCvText(''); }}
              className="a2i-btn a2i-btn-ghost" style={{ padding: '8px 16px', fontSize: 11, opacity: 0.6 }}>
              Clear
            </button>
          )}
        </div>

        {cvKind === 'file' && (
          <label
            className="block text-center cursor-pointer"
            style={{ border: '1.5px dashed var(--gold-border)', padding: 20 }}
          >
            <span className="a2i-prose" style={{ fontSize: 13, color: 'var(--cream)' }}>
              {cvFile ? cvFile.name : 'Click to upload your CV'}
            </span>
            <span className="block a2i-prose" style={{ fontSize: 11, marginTop: 4 }}>
              PDF, DOC, DOCX or TXT (max 10 MB)
            </span>
            <input type="file" accept={ACCEPT} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="hidden" />
          </label>
        )}

        {cvKind === 'text' && (
          <textarea
            className="a2i-field"
            rows={8}
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            placeholder="Paste the text of your CV here…"
          />
        )}
      </div>

      {status === 'error' && errorMsg && (
        <p className="a2i-prose" style={{ fontSize: 14, color: 'var(--gold-bright)' }}>{errorMsg}</p>
      )}

      <div>
        <button type="submit" disabled={status === 'submitting'} className="a2i-btn">
          {status === 'submitting' ? 'Submitting…' : 'Submit my details'}
        </button>
      </div>
    </form>
  );
}
