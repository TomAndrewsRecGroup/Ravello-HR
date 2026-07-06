'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import DevPlanWizard from './DevPlanWizard';

export default function DevPlanWizardLauncher({
  companies,
  athletes,
}: {
  companies: Array<{ id: string; name: string }>;
  athletes: Array<{ id: string; full_name: string; company_id: string }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-cta" onClick={() => setOpen(true)}>
        <Wand2 size={14} /> Guided setup
      </button>
      {open && <DevPlanWizard companies={companies} athletes={athletes} onClose={() => setOpen(false)} />}
    </>
  );
}
