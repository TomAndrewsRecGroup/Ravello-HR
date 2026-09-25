'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Loader2, Package, Paperclip, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { HS_EQUIPMENT_STATUS_LABELS, HS_EQUIPMENT_STATUSES, type HsEquipmentStatus } from '@/lib/hs/vocab';
import {
  HS_EQUIPMENT_INSPECTION_OUTCOME_LABELS, HS_EQUIPMENT_INSPECTION_OUTCOMES, type HsEquipmentInspectionOutcome,
} from '@/lib/hs/vocab';
import { HS_EVIDENCE_ACCEPT, evidenceUrl, uploadEvidence } from '@/lib/hs/evidence';
import { daysUntil } from '@/lib/hs/recurrence';
import type { HsEquipment, HsEquipmentInspection, HsFile } from '@/lib/hs/types';

interface Props {
  companyId: string;
  canRecord: boolean;
  equipment: HsEquipment[];
  inspections: HsEquipmentInspection[];
  files: HsFile[];
  loadError: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

function dueColour(due: string | null, status: HsEquipmentStatus): string {
  if (status !== 'in_service' || !due) return 'var(--ink-faint)';
  const d = daysUntil(due);
  if (d < 0) return 'var(--red)';
  if (d <= 30) return 'var(--gold)';
  return 'var(--teal)';
}

export default function EquipmentClient({ companyId, canRecord, equipment, inspections, files, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [serial, setSerial] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('hs_equipment').insert({
      company_id: companyId, name: name.trim(), category: category.trim() || null, serial_number: serial.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Equipment added', 'success');
    setName(''); setCategory(''); setSerial(''); setOpen(false);
    router.refresh();
  }

  async function setStatus(id: string, status: HsEquipmentStatus) {
    const res = await createClient().from('hs_equipment').update({ status }, COUNT_EXACT).eq('id', id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the status.', 'error'); return; }
    router.refresh();
  }

  const inspectionsByEquipment = new Map<string, HsEquipmentInspection[]>();
  for (const i of inspections) inspectionsByEquipment.set(i.equipment_id, [...(inspectionsByEquipment.get(i.equipment_id) ?? []), i]);
  const filesFor = (id: string) => files.filter(f => f.entity_id === id);

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load equipment: {loadError}</p>}
      {canRecord && (
        <div className="flex">
          <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Add equipment</button>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={200} required placeholder="Forklift FLT-02" />
          </label>
          <label className="block">
            <span className="label">Category (optional)</span>
            <input className="input" value={category} onChange={e => setCategory(e.target.value)} maxLength={100} placeholder="Lifting equipment" />
          </label>
          <label className="block">
            <span className="label">Serial number (optional)</span>
            <input className="input" value={serial} onChange={e => setSerial(e.target.value)} maxLength={100} />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !name.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Add</button>
          </div>
        </form>
      )}

      {equipment.length === 0 ? (
        <div className="card empty-state p-10">
          <Package size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No equipment on the register.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {equipment.map(item => {
            const isOpen = expanded === item.id;
            const history = inspectionsByEquipment.get(item.id) ?? [];
            return (
              <li key={item.id}>
                <button className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : item.id)}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate" style={{ color: 'var(--ink)' }}>{item.name}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {item.category ?? 'Uncategorised'}{item.serial_number && ` · ${item.serial_number}`}
                    </span>
                  </span>
                  <span className="text-right text-sm whitespace-nowrap">
                    <span className="block font-medium" style={{ color: dueColour(item.next_inspection_due, item.status) }}>
                      {item.status === 'in_service' && item.next_inspection_due && daysUntil(item.next_inspection_due) < 0 && <AlertTriangle size={12} className="inline mr-1" />}
                      {HS_EQUIPMENT_STATUS_LABELS[item.status]}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {item.next_inspection_due ? `due ${fmt(item.next_inspection_due)}` : 'no due date'}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-4">
                    {canRecord && (
                      <label className="flex items-center gap-1.5 text-xs">
                        <span style={{ color: 'var(--ink-faint)' }}>Status</span>
                        <select className="input input-sm" value={item.status} onChange={e => setStatus(item.id, e.target.value as HsEquipmentStatus)}>
                          {HS_EQUIPMENT_STATUSES.map(s => <option key={s} value={s}>{HS_EQUIPMENT_STATUS_LABELS[s]}</option>)}
                        </select>
                      </label>
                    )}

                    {canRecord && <InspectionForm companyId={companyId} equipmentId={item.id} />}

                    <div>
                      <h3 className="label">Inspection history</h3>
                      {history.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Nothing recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {history.map(insp => (
                            <li key={insp.id} className="text-sm rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                              <div className="flex flex-wrap gap-x-3">
                                <strong style={{ color: 'var(--ink)' }}>{fmt(insp.inspected_on)}</strong>
                                <span style={{ color: insp.outcome === 'fail' ? 'var(--red)' : 'var(--ink-soft)' }}>
                                  {HS_EQUIPMENT_INSPECTION_OUTCOME_LABELS[insp.outcome]}
                                </span>
                                <span style={{ color: 'var(--ink-faint)' }}>by {insp.recorded_by_kind}</span>
                                {insp.next_due_on && <span style={{ color: 'var(--ink-faint)' }}>next due {fmt(insp.next_due_on)}</span>}
                              </div>
                              {insp.notes && <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{insp.notes}</p>}
                              <EvidenceList files={filesFor(insp.id)} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EvidenceList({ files }: { files: HsFile[] }) {
  const { toast } = useToast();
  if (files.length === 0) return null;
  async function openFile(f: HsFile) {
    const url = await evidenceUrl(createClient(), f.storage_path);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Could not open that file.', 'error');
  }
  return (
    <ul className="mt-1 flex flex-wrap gap-2">
      {files.map(f => (
        <li key={f.id}><button className="btn-ghost btn-sm" onClick={() => openFile(f)}><FileText size={13} /> {f.file_name}</button></li>
      ))}
    </ul>
  );
}

function InspectionForm({ companyId, equipmentId }: { companyId: string; equipmentId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(today());
  const [outcome, setOutcome] = useState<HsEquipmentInspectionOutcome>('pass');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');
  const [fileList, setFileList] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    // company_id is overwritten by the database from the equipment row
    // itself (hs_equipment_inspection_fill); sent only because it's NOT NULL.
    const { data, error } = await supabase.from('hs_equipment_inspections').insert({
      equipment_id: equipmentId, company_id: companyId, inspected_on: on, outcome,
      next_due_on: nextDue || null, notes: notes.trim() || null,
    }).select('id').single();
    if (error || !data) { setBusy(false); toast(error?.message ?? 'Could not record the inspection.', 'error'); return; }

    const problems: string[] = [];
    for (const file of fileList) {
      const p = await uploadEvidence(supabase, { companyId, entityType: 'equipment_inspection', entityId: data.id, file });
      if (p) problems.push(p);
    }
    setBusy(false);
    if (problems.length) toast(`Recorded, but: ${problems.join(' ')}`, 'error');
    else toast('Inspection recorded', 'success');
    setNextDue(''); setNotes(''); setFileList([]);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--line)' }}>
      <h3 className="label">Record an inspection</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Inspected on</span>
          <input className="input" type="date" value={on} max={today()} onChange={e => setOn(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Outcome</span>
          <select className="input" value={outcome} onChange={e => setOutcome(e.target.value as HsEquipmentInspectionOutcome)}>
            {HS_EQUIPMENT_INSPECTION_OUTCOMES.map(o => <option key={o} value={o}>{HS_EQUIPMENT_INSPECTION_OUTCOME_LABELS[o]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Next due (optional)</span>
          <input className="input" type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="label">Notes (optional)</span>
        <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
      </label>
      <label className="block">
        <span className="label flex items-center gap-1.5"><Paperclip size={13} /> Evidence (certificate, photo)</span>
        <input type="file" multiple accept={HS_EVIDENCE_ACCEPT.join(',')} onChange={e => setFileList(Array.from(e.target.files ?? []))} className="text-sm" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
        {outcome === 'fail' && (
          <span className="text-xs" style={{ color: 'var(--red)' }}>A failed inspection does not move the next-due date.</span>
        )}
      </div>
    </form>
  );
}
