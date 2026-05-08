import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { buildPatch, type AthleteFields } from '@/lib/athletes/validate';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: AthleteFields & { called?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch = buildPatch(body);
  if ('error' in patch) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  // Admin-only "Called" toggle. Booleans get translated into the
  // canonical timestamp + caller pair so we can later show when the
  // call was made and by whom.
  if (typeof body.called === 'boolean') {
    if (body.called) {
      patch.called_at = new Date().toISOString();
      patch.called_by = auth.userId;
    } else {
      patch.called_at = null;
      patch.called_by = null;
    }
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('athletes').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Best-effort cleanup of CV/avatar files in storage before the row.
  try {
    const { data: athlete } = await supabase
      .from('athletes')
      .select('id, company_id')
      .eq('id', params.id)
      .single();
    if (athlete) {
      // New private bucket (mig 068).
      const folder = `${athlete.company_id}/${athlete.id}`;
      const { data: files } = await supabase.storage.from('athlete-cvs').list(folder);
      if (files && files.length > 0) {
        await supabase.storage
          .from('athlete-cvs')
          .remove(files.map(f => `${folder}/${f.name}`));
      }
      // Legacy folder in the shared 'documents' bucket — best-effort
      // sweep for athletes whose CVs were uploaded before mig 068.
      const legacy = `athletes/${athlete.company_id}/${athlete.id}`;
      const { data: legacyFiles } = await supabase.storage.from('documents').list(legacy);
      if (legacyFiles && legacyFiles.length > 0) {
        await supabase.storage
          .from('documents')
          .remove(legacyFiles.map(f => `${legacy}/${f.name}`));
      }
    }
  } catch { /* non-fatal */ }

  const { error } = await supabase.from('athletes').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
