import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { z, uuid } from '@/lib/validation/primitives';
import { notify } from '@/lib/notify/notify';

export const runtime = 'nodejs';

// POST /api/admin/lessons-learned/[id]/publish — Core-OS 360 Phase 16,
// Group 2. Publishes a lesson (if still a draft) and distributes it to
// the given companies. Called both for a first publish AND to add
// further recipients to an already-published lesson — inserting a
// distribution for a company already holding one is simply skipped
// (the table's own UNIQUE constraint), never an error.
//
// This is the one place a lesson is ever told to a client: a direct,
// synchronous notify() call per company, the same lib/bd/score.ts /
// H&S Tests precedent for a route that already holds the data a
// consequence rule would otherwise have to re-derive from an outbox
// event with no single company_id to key on (lessons_learned has none
// at all).
const Body = z.object({ companyIds: z.array(uuid).max(500) });

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const params = await props.params;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const supabase = await createServerSupabaseClient();

  const { data: lesson } = await supabase.from('lessons_learned')
    .select('id, title, status').eq('id', params.id).maybeSingle();
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  if (lesson.status === 'archived') return NextResponse.json({ error: 'An archived lesson cannot be distributed. Unarchive it first.' }, { status: 400 });

  if (lesson.status === 'draft') {
    const { error, count } = await supabase.from('lessons_learned').update({ status: 'published' }, { count: 'exact' }).eq('id', lesson.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!count) return NextResponse.json({ error: 'The lesson could not be published — it may have changed.' }, { status: 409 });
  }

  const companyIds = [...new Set(parsed.data.companyIds)];
  let distributed = 0;
  for (const companyId of companyIds) {
    const { error, count } = await supabase.from('lesson_learned_distributions')
      .insert({ lesson_id: lesson.id, company_id: companyId }, { count: 'exact' });
    if (error) {
      // A duplicate (already distributed to this company) is expected
      // and silently skipped; any other error is reported per-company
      // rather than aborting the whole batch.
      if (!error.message.includes('duplicate key')) {
        return NextResponse.json({ error: `Could not share with one client: ${error.message}` }, { status: 500 });
      }
      continue;
    }
    if ((count ?? 0) > 0) {
      distributed += 1;
      await notify(supabase, {
        audiences: [{ kind: 'company_admins', companyId }], companyId, type: 'lesson_learned_published',
        title: `A new lesson learned has been shared with you: ${lesson.title}`,
        link: { portal: '/protect/lessons-learned' },
        dedupeKey: `lesson_learned_published:${lesson.id}:${companyId}`,
      });
    }
  }

  return NextResponse.json({ ok: true, distributed });
}
