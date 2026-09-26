import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { z, uuid, shortText, optionalShortText, optionalLongText, optionalHttpsUrl, percentage, enumOf } from '@/lib/validation/primitives';
import { HS_TEST_SOURCE_TYPES } from '@/lib/hs/vocab';

// POST /api/admin/hs/tests — create a test in the bank. Only 'built_in'
// carries questions this platform marks itself; see migration 116's own
// header comment for why 'link'/'ms_forms'/'manual' never auto-mark.

export const runtime = 'nodejs';

const QuestionInput = z.object({
  id:                 uuid,
  prompt:             shortText(500),
  options:            z.array(z.object({ id: shortText(10), label: shortText(200) })).min(2).max(8),
  correct_option_id:  shortText(10),
}).refine(q => q.options.some(o => o.id === q.correct_option_id), { message: 'correct_option_id must name one of the options' });

const Body = z.object({
  title:              shortText(200),
  description:        optionalLongText(4000),
  category:           optionalShortText(100),
  source_type:        enumOf(HS_TEST_SOURCE_TYPES),
  external_url:       optionalHttpsUrl,
  pass_mark:          percentage.optional().nullable(),
  questions:          z.array(QuestionInput).max(100).optional().nullable(),
  certifies_training: z.boolean().default(false),
  recert_months:      z.number().int().min(1).max(120).optional().nullable(),
}).refine(b => b.source_type !== 'built_in' || (b.pass_mark != null && !!b.questions?.length), {
  message: 'A built-in test needs a pass mark and at least one question', path: ['questions'],
}).refine(b => b.source_type === 'built_in' || !!b.external_url || b.source_type === 'manual', {
  message: 'A link or Microsoft Forms test needs a URL', path: ['external_url'],
});

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('hs_tests').insert({
    title: b.title, description: b.description, category: b.category,
    source_type: b.source_type, external_url: b.source_type === 'built_in' ? null : b.external_url,
    pass_mark: b.source_type === 'built_in' ? b.pass_mark : null,
    questions: b.source_type === 'built_in' ? b.questions : null,
    certifies_training: b.certifies_training, recert_months: b.recert_months,
    created_by: auth.userId,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
