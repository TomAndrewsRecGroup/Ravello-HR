'use client';

import { useState, type FormEvent } from 'react';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const OPPORTUNITIES_PLACEHOLDER =
  'Tell us what roles or opportunities you may have for our Athletes.....';

export default function PartnerReferralForm({ slug }: { slug: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') ?? ''),
      location: String(fd.get('location') ?? ''),
      website: String(fd.get('website') ?? ''),
      sector: String(fd.get('sector') ?? ''),
      opportunities: String(fd.get('opportunities') ?? ''),
      company: String(fd.get('company') ?? ''), // honeypot
    };

    if (!payload.name.trim()) {
      setStatus('error');
      setErrorMsg('Name is required.');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/r/partner/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus('success');
        form.reset();
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
        <p className="a2i-section-label">Received</p>
        <h2 className="a2i-display" style={{ fontSize: 26 }}>Thank you.</h2>
        <p className="a2i-prose" style={{ fontSize: 15 }}>
          Your details are on their way to the team. Andrews Recruitment Group will be in touch to
          explore how your opportunities can support our athletes.
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/* Honeypot */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-6">
        <div>
          <label htmlFor="name" className="a2i-label">Name *</label>
          <input id="name" name="name" type="text" required className="a2i-field" placeholder="Your name or organisation" />
        </div>
        <div>
          <label htmlFor="location" className="a2i-label">Location</label>
          <input id="location" name="location" type="text" className="a2i-field" placeholder="London, Manchester, Remote…" />
        </div>
        <div>
          <label htmlFor="website" className="a2i-label">Website</label>
          <input id="website" name="website" type="url" className="a2i-field" placeholder="https://…" />
        </div>
        <div>
          <label htmlFor="sector" className="a2i-label">Sector</label>
          <input id="sector" name="sector" type="text" className="a2i-field" placeholder="Construction, Finance, Tech…" />
        </div>
      </div>

      <div>
        <label htmlFor="opportunities" className="a2i-label">Opportunities Available</label>
        <textarea
          id="opportunities"
          name="opportunities"
          rows={5}
          className="a2i-field"
          placeholder={OPPORTUNITIES_PLACEHOLDER}
        />
      </div>

      {status === 'error' && errorMsg && (
        <p className="a2i-prose" style={{ fontSize: 14, color: 'var(--gold-bright)' }}>{errorMsg}</p>
      )}

      <div>
        <button type="submit" disabled={status === 'submitting'} className="a2i-btn">
          {status === 'submitting' ? 'Sending…' : 'Submit opportunities'}
        </button>
      </div>
    </form>
  );
}
