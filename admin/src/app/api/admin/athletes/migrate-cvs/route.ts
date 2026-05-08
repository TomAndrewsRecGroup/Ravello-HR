import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

export const runtime = 'nodejs';
export const maxDuration = 300; // up to 5 minutes for the batch

const OLD_BUCKET = 'documents';
const NEW_BUCKET = 'athlete-cvs';

interface AthleteRow {
  id: string;
  company_id: string;
  cv_kind: 'file' | 'text' | null;
  cv_url: string | null;
  cv_storage_path: string | null;
  cv_filename: string | null;
  cv_mime: string | null;
}

interface Result {
  id: string;
  status: 'migrated' | 'skipped' | 'error';
  detail: string;
}

// POST /api/admin/athletes/migrate-cvs
// One-shot migration that walks every athlete whose CV is still
// pinned to the legacy 'documents' bucket and republishes it to
// the new private 'athlete-cvs' bucket at <company_id>/<athlete>/…
// after which the GET /cv signed-URL flow works end-to-end.
//
// Idempotent: skips athletes already on the new bucket. Safe to
// re-run if the previous batch crashed.
export async function POST() {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const supabase = createServerSupabaseClient();

  const { data: rows, error: listErr } = await supabase
    .from('athletes')
    .select('id, company_id, cv_kind, cv_url, cv_storage_path, cv_filename, cv_mime')
    .eq('cv_kind', 'file');
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const results: Result[] = [];

  for (const a of (rows ?? []) as AthleteRow[]) {
    try {
      // Path on the new bucket either lives at <company>/<athlete>/...
      // already (skip) or under athletes/... in the old bucket.
      const oldPath = a.cv_storage_path?.startsWith('athletes/')
        ? a.cv_storage_path
        : null;

      if (!oldPath) {
        // Path is missing or already in the new shape — nothing to do.
        results.push({ id: a.id, status: 'skipped', detail: 'no legacy path' });
        continue;
      }

      // Download bytes from the old bucket.
      const { data: blob, error: dlErr } = await supabase.storage
        .from(OLD_BUCKET)
        .download(oldPath);
      if (dlErr || !blob) {
        results.push({ id: a.id, status: 'error', detail: `download: ${dlErr?.message ?? 'no data'}` });
        continue;
      }

      const tail = oldPath.split('/').slice(-1)[0];
      const newPath = `${a.company_id}/${a.id}/${tail}`;

      const { error: upErr } = await supabase.storage
        .from(NEW_BUCKET)
        .upload(newPath, blob, {
          contentType: a.cv_mime ?? blob.type ?? 'application/octet-stream',
          upsert: true,
        });
      if (upErr) {
        results.push({ id: a.id, status: 'error', detail: `upload: ${upErr.message}` });
        continue;
      }

      const { error: updErr } = await supabase
        .from('athletes')
        .update({
          cv_url:          null,    // never trust the legacy public URL
          cv_storage_path: newPath,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', a.id);
      if (updErr) {
        results.push({ id: a.id, status: 'error', detail: `db: ${updErr.message}` });
        continue;
      }

      // Best-effort cleanup of the old object. Failures here are
      // tolerable — the canonical pointer is already on the new
      // bucket, the orphan can be swept later.
      await supabase.storage.from(OLD_BUCKET).remove([oldPath]).catch(() => {});

      results.push({ id: a.id, status: 'migrated', detail: newPath });
    } catch (e) {
      results.push({ id: a.id, status: 'error', detail: (e as Error).message });
    }
  }

  const summary = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  return NextResponse.json({ summary, results });
}
