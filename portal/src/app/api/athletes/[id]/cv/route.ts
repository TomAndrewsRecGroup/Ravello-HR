import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { CV_MIME_ALLOW, CV_EXT_ALLOW, CV_MAX_BYTES } from '@/lib/athletes/validate';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Private bucket dedicated to athlete CVs (migration 068).
// Reads must always go through createSignedUrl().
const STORAGE_BUCKET = 'athlete-cvs';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const { user, companyId } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!companyId) {
    return NextResponse.json({ error: 'no company' }, { status: 403 });
  }
  const supabase = createServerSupabaseClient();
  const { data: athlete } = await supabase
    .from('athletes').select('id, company_id').eq('id', params.id).single();
  if (!athlete || athlete.company_id !== companyId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > CV_MAX_BYTES) {
    return NextResponse.json({ error: 'file exceeds 10 MB limit' }, { status: 400 });
  }
  if (!CV_MIME_ALLOW.has(file.type)) {
    return NextResponse.json({ error: `unsupported mime: ${file.type}` }, { status: 400 });
  }
  const ext = extFromName(file.name);
  if (!CV_EXT_ALLOW.has(ext)) {
    return NextResponse.json({ error: `unsupported extension: .${ext}` }, { status: 400 });
  }

  // Path: <company_id>/<athlete_id>/<timestamp>_<safe-name>.
  // First folder must equal company_id so per-company RLS in
  // migration 068 grants the owning client read access.
  const path = `${athlete.company_id}/${athlete.id}/${Date.now()}_${safeName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Bucket is private — never store a public URL. Mint a short-
  // lived signed URL for the immediate response; downstream readers
  // re-sign via GET /api/athletes/[id]/cv on demand.
  const { data: signed } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  const { data: row, error: updateError } = await supabase
    .from('athletes')
    .update({
      cv_kind:         'file',
      cv_url:          null,         // legacy field — no longer trusted
      cv_storage_path: path,
      cv_filename:     file.name,
      cv_mime:         file.type,
      cv_text:         null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', athlete.id)
    .select('id, company_id, full_name, email, phone, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, created_at')
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: signed?.signedUrl ?? null, filename: file.name, row });
}

// GET — return a fresh short-lived signed URL for the athlete's CV.
// Caller must belong to the athlete's company.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const { user, companyId } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!companyId) return NextResponse.json({ error: 'no company' }, { status: 403 });

  const supabase = createServerSupabaseClient();
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, company_id, cv_storage_path, cv_filename')
    .eq('id', params.id)
    .single();
  if (!athlete || athlete.company_id !== companyId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!athlete.cv_storage_path) {
    return NextResponse.json({ error: 'no CV on file' }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(athlete.cv_storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'sign failed' }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl, filename: athlete.cv_filename ?? 'cv' });
}
