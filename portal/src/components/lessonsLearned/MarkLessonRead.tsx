'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// company_id/read_by/read_by_name are all derived server-side by
// lesson_learned_reads_fill() (migration 181) — nothing sent from here
// is trusted, so the insert only ever needs to name the lesson.
export default function MarkLessonRead({ lessonId, alreadyRead }: { lessonId: string; alreadyRead: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alreadyRead);

  if (done) {
    return <p className="text-xs flex items-center gap-1" style={{ color: 'var(--teal)' }}><Check size={13} /> Marked as read</p>;
  }

  async function markRead() {
    setBusy(true);
    const { error } = await createClient().from('lesson_learned_reads').insert({ lesson_id: lessonId });
    setBusy(false);
    if (error) return;
    setDone(true);
    router.refresh();
  }

  return (
    <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={markRead}>
      {busy ? 'Marking…' : 'Mark as read'}
    </button>
  );
}
