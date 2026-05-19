import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { buildPatch, type AthleteFields } from '@/lib/athletes/validate';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadCompanyAthlete(supabase: ReturnType<typeof createServerSupabaseClient>, athleteId: string) {
  const { user, companyId } = await getSessionProfile();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!companyId) {
    return { error: NextResponse.json({ error: 'no company' }, { status: 403 }) };
  }
  const { data: athlete } = await supabase
    .from('athletes').select('id, company_id').eq('id', athleteId).single();
  if (!athlete || athlete.company_id !== companyId) {
    return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  }
  return { user, athlete };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const guard = await loadCompanyAthlete(supabase, params.id);
  if ('error' in guard) return guard.error;

  let body: AthleteFields;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const patch = buildPatch(body);
  if ('error' in patch) return NextResponse.json({ error: patch.error }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data: row, error } = await supabase
    .from('athletes')
    .update(patch)
    .eq('id', params.id)
    .select('id, company_id, full_name, email, phone, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, called_at, welcome_email_sent_at, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const guard = await loadCompanyAthlete(supabase, params.id);
  if ('error' in guard) return guard.error;
  const { athlete } = guard;

  // Best-effort: list and delete CV/avatar files in storage before the row.
  // List failures are non-fatal — the row delete still goes through.
  try {
    // New private bucket (mig 068).
    const folder = `${athlete.company_id}/${athlete.id}`;
    const { data: files } = await supabase.storage.from('athlete-cvs').list(folder);
    if (files && files.length > 0) {
      await supabase.storage
        .from('athlete-cvs')
        .remove(files.map(f => `${folder}/${f.name}`));
    }
    // Legacy sweep: the shared 'documents' bucket where CVs lived
    // before mig 068. Cheap to attempt; ignored on miss.
    const legacy = `athletes/${athlete.company_id}/${athlete.id}`;
    const { data: legacyFiles } = await supabase.storage.from('documents').list(legacy);
    if (legacyFiles && legacyFiles.length > 0) {
      await supabase.storage
        .from('documents')
        .remove(legacyFiles.map(f => `${legacy}/${f.name}`));
    }
  } catch { /* swallow: orphaned files are tolerable, orphaned interests are not */ }

  const { error } = await supabase.from('athletes').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
