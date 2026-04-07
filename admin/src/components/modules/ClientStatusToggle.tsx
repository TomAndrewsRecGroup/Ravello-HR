'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';

interface Props { companyId: string; currentActive: boolean; }

export default function ClientStatusToggle({ companyId, currentActive }: Props) {
  const supabase = createClient();
  const [active, setActive] = useState(currentActive);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const newVal = !active;
    await supabase.from('companies').update({ active: newVal }).eq('id', companyId);
    setActive(newVal);
    setLoading(false);
    revalidateAdminPath(`/clients/${companyId}`);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`badge ${active ? 'badge-active' : 'badge-inactive'} cursor-pointer hover:opacity-80 transition-opacity`}
    >
      {loading ? '…' : active ? 'Active' : 'Inactive'}
    </button>
  );
}
