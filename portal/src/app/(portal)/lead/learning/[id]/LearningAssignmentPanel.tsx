'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { CheckCircle2, Loader2, UserPlus } from 'lucide-react';

interface Assignment {
  id: string;
  status: 'assigned' | 'in_progress' | 'completed';
  progress_percent: number;
  due_date: string | null;
  assigned_at: string;
}

// Real LMS assignment + progress tracking for the e-learning
// marketplace (learning_content/learning_purchases, 006) — closes the
// named gap: a company-wide purchase window is real, but there was no
// way to assign a SPECIFIC piece of content to a SPECIFIC employee and
// track their own completion. learning_assignments (202) is the table;
// this panel is its one UI.
//
// Progress is self-reported — there is no video-player hook to read
// actual watch time from, so "mark complete" is the real signal, the
// same honest default this codebase uses throughout rather than
// fabricate a number.
export default function LearningAssignmentPanel({
  contentId, myAssignment, canManage, teamPeople,
}: {
  contentId: string;
  myAssignment: Assignment | null;
  canManage: boolean;
  teamPeople: { id: string; full_name: string }[];
}) {
  const supabase = createClient();
  const [assignment, setAssignment] = useState(myAssignment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [personId, setPersonId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignDone, setAssignDone] = useState<string | null>(null);

  async function markComplete() {
    if (!assignment) return;
    setBusy(true);
    setError(null);
    const res = await supabase.from('learning_assignments')
      .update({ status: 'completed', progress_percent: 100 }, COUNT_EXACT).eq('id', assignment.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { setError(outcome.message ?? 'Could not update your progress.'); return; }
    setAssignment({ ...assignment, status: 'completed', progress_percent: 100 });
    revalidatePortalPath(`/lead/learning/${contentId}`);
  }

  async function startIt() {
    if (!assignment || assignment.status !== 'assigned') return;
    setBusy(true);
    setError(null);
    const res = await supabase.from('learning_assignments')
      .update({ status: 'in_progress', progress_percent: Math.max(assignment.progress_percent, 10), started_at: new Date().toISOString() }, COUNT_EXACT)
      .eq('id', assignment.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { setError(outcome.message ?? 'Could not update your progress.'); return; }
    setAssignment({ ...assignment, status: 'in_progress', progress_percent: Math.max(assignment.progress_percent, 10) });
    revalidatePortalPath(`/lead/learning/${contentId}`);
  }

  async function assign() {
    if (!personId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('learning_assignments').upsert({
      content_id: contentId, person_id: personId, due_date: dueDate || null,
    }, { onConflict: 'content_id,person_id' });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setAssignDone(teamPeople.find(p => p.id === personId)?.full_name ?? 'them');
    setPersonId(''); setDueDate('');
    revalidatePortalPath(`/lead/learning/${contentId}`);
  }

  return (
    <div className="space-y-4">
      {assignment && (
        <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
            Assigned to you{assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString('en-GB')}` : ''}
          </p>
          {assignment.status === 'completed' ? (
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={13} /> Completed
            </p>
          ) : (
            <div className="flex gap-2">
              {assignment.status === 'assigned' && (
                <button className="btn-secondary btn-sm" disabled={busy} onClick={startIt}>Start</button>
              )}
              <button className="btn-cta btn-sm" disabled={busy} onClick={markComplete}>
                {busy && <Loader2 size={12} className="animate-spin" />} Mark complete
              </button>
            </div>
          )}
        </div>
      )}

      {canManage && teamPeople.length > 0 && (
        <div className="space-y-2">
          {!showAssign ? (
            <button type="button" className="btn-ghost btn-sm w-full justify-center" onClick={() => setShowAssign(true)}>
              <UserPlus size={13} /> Assign to a team member
            </button>
          ) : (
            <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <select className="input text-xs py-1.5" value={personId} onChange={e => setPersonId(e.target.value)}>
                <option value="">Choose a team member…</option>
                {teamPeople.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <input type="date" className="input text-xs py-1.5" value={dueDate} onChange={e => setDueDate(e.target.value)} placeholder="Due date (optional)" />
              <div className="flex gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setShowAssign(false)}>Cancel</button>
                <button type="button" className="btn-cta btn-sm" disabled={busy || !personId} onClick={assign}>
                  {busy && <Loader2 size={12} className="animate-spin" />} Assign
                </button>
              </div>
              {assignDone && <p className="text-xs" style={{ color: 'var(--success)' }}>Assigned to {assignDone}.</p>}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
