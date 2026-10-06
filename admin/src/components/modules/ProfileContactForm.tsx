'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, Loader2 } from 'lucide-react';

// A client's "Your account contact" card on the portal shows whichever
// staff member is set as their account manager (companies.account_
// owner_id) by name/email/phone — but nothing before this let a staff
// member actually set their own phone number, since profiles.phone
// (212) is new and no UI wrote it. This is the one place they do.

export interface ContactInitial {
  full_name: string;
  phone:     string;
}

export default function ProfileContactForm({ userId, initial }: { userId: string; initial: ContactInitial }) {
  const supabase = createClient();
  const [fullName, setFullName] = useState(initial.full_name);
  const [phone,    setPhone]    = useState(initial.phone);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');

  async function save() {
    setSaving(true);
    setError('');
    const { error: err, count } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null }, { count: 'exact' })
      .eq('id', userId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (!count) { setError('Nothing was saved.'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="card p-6">
      <p className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>Your contact details</p>
      <p className="text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>
        Shown to any client you're set as the account manager for, on their own "Your account contact" card.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 07123 456789" maxLength={60} />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button onClick={save} disabled={saving} className="btn-secondary btn-sm">
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : 'Save'}
        </button>
        {error && <p className="text-[11px]" style={{ color: 'var(--red)' }}>{error}</p>}
      </div>
    </div>
  );
}
