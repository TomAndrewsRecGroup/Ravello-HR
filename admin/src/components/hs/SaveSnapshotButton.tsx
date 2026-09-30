'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import type { ComplianceTwinSnapshot } from '@/lib/complianceTwin/assemble';

// Core-OS 360 Completion Programme, Phase 23, Group 4 (closes
// gap-ledger row C12.4 — "stored snapshot / history for posture
// trend"). Inserts the ALREADY-COMPUTED, ALREADY-RENDERED snapshot the
// page just built — zero extra query cost, since the page already ran
// loadComplianceTwinSnapshot() to render itself. A staff session may
// write directly under RLS (compliance_twin_snapshots_staff_all, 188),
// the same "session insert under RLS" pattern DocumentsClient.tsx/
// ContractorsClient.tsx already use for staff-side writes — no API
// route needed. A same-day re-save UPSERTs (the table's own
// UNIQUE(company_id, snapshot_date)) rather than duplicating.
export default function SaveSnapshotButton({ companyId, snapshot }: {
  companyId: string;
  snapshot: ComplianceTwinSnapshot;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { data: auth } = await createClient().auth.getUser();
    const { error } = await createClient().from('compliance_twin_snapshots').upsert({
      company_id: companyId,
      snapshot_date: new Date().toISOString().slice(0, 10),
      overall_band: snapshot.overallBand,
      areas: snapshot.areas,
      created_by: auth.user?.id ?? null,
    }, { onConflict: 'company_id,snapshot_date' });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast("Today's snapshot saved", 'success');
    router.refresh();
  }

  return (
    <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={save}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Save today&apos;s snapshot
    </button>
  );
}
