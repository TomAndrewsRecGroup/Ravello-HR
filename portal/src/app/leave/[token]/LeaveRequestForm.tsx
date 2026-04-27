'use client';
import { useState } from 'react';
import { Loader2, CheckCircle2, Calendar, Send, Palmtree } from 'lucide-react';
import { ABSENCE_TYPE_LABELS, labelFor } from '@/lib/ui/statusMaps';

interface Props {
  token:        string;
  employeeName: string;
  companyName:  string;
  leaveTypes:   string[];
}

export default function LeaveRequestForm({ token, employeeName, companyName, leaveTypes }: Props) {
  const [absenceType, setAbsenceType] = useState('holiday');
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [reason,      setReason]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [submitted,   setSubmitted]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Please give a start and end date.');
      return;
    }
    if (startDate > endDate) {
      setError('Start date must be on or before the end date.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/leave/${encodeURIComponent(token)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          absence_type: absenceType,
          start_date:   startDate,
          end_date:     endDate,
          reason:       reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit.');
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <CheckCircle2 size={44} style={{ color: 'var(--teal, #14B8A6)' }} className="mx-auto mb-3" />
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>
            Request sent
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Thanks, {employeeName.split(' ')[0]}. Your manager at {companyName} will review your request and let you know.
          </p>
          <p className="text-xs mt-5" style={{ color: 'var(--ink-faint)' }}>
            You can close this tab.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[480px]">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto rounded-[12px] flex items-center justify-center mb-3" style={{ background: 'rgba(124,58,237,0.10)' }}>
            <Palmtree size={20} style={{ color: 'var(--purple, #7C3AED)' }} />
          </div>
          <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>
            Request leave
          </h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Hi {employeeName.split(' ')[0]} — fill this out and your manager at {companyName} will pick it up.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={submit}
          className="rounded-[20px] p-6 space-y-4"
          style={{ background: '#fff', border: '1px solid var(--line)' }}
        >
          <div className="form-group">
            <label className="label" style={{ color: 'var(--ink-soft)' }}>Type of leave</label>
            <select
              className="input"
              value={absenceType}
              onChange={e => setAbsenceType(e.target.value)}
              required
            >
              {leaveTypes.map(t => (
                <option key={t} value={t}>{labelFor(ABSENCE_TYPE_LABELS, t)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
                <Calendar size={12} /> Start date
              </label>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="label flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
                <Calendar size={12} /> End date
              </label>
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                min={startDate || undefined}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label" style={{ color: 'var(--ink-soft)' }}>Reason (optional)</label>
            <textarea
              className="input"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Anything your manager should know."
              maxLength={500}
            />
          </div>

          {error && (
            <div className="rounded-[10px] p-3 text-sm" style={{ background: 'rgba(217,68,68,0.06)', border: '1px solid rgba(217,68,68,0.20)', color: 'var(--red, #D94444)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {loading ? 'Sending…' : 'Send request'}
          </button>
        </form>

        <p className="text-xs text-center mt-5" style={{ color: 'var(--ink-faint)' }}>
          Powered by The People System
        </p>
      </div>
    </main>
  );
}
