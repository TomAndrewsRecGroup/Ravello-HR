import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CV_MIME_ALLOW, CV_EXT_ALLOW, CV_MAX_BYTES } from '@/lib/athletes/validate';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_BUCKET = 'documents';

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
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) {
    return NextResponse.json({ error: 'no company' }, { status: 403 });
  }
  const { data: athlete } = await supabase
    .from('athletes').select('id, company_id').eq('id', params.id).single();
  if (!athlete || athlete.company_id !== profile.company_id) {
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

  const path = `athletes/${athlete.company_id}/${athlete.id}/${Date.now()}_${safeName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const { data: row, error: updateError } = await supabase
    .from('athletes')
    .update({
      cv_kind: 'file',
      cv_url: publicUrl,
      cv_filename: file.name,
      cv_mime: file.type,
      cv_text: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', athlete.id)
    .select('id, company_id, full_name, email, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, created_at')
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl, filename: file.name, row });
}
