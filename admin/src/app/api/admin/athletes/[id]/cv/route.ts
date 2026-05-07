import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
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
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
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

  const supabase = createServerSupabaseClient();

  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, company_id')
    .eq('id', params.id)
    .single();
  if (!athlete) {
    return NextResponse.json({ error: 'athlete not found' }, { status: 404 });
  }

  const path = `athletes/${athlete.company_id}/${athlete.id}/${Date.now()}_${safeName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // cv_storage_path is the canonical reference (mig 062). cv_url is
  // retained for backward compat with existing readers — only works
  // while bucket stays private + caller authenticated. New readers
  // should sign on demand via lib/storage/files.ts > signFileUrl().
  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('athletes')
    .update({
      cv_kind:         'file',
      cv_url:          publicUrl,   // legacy compat
      cv_storage_path: path,        // canonical
      cv_filename:     file.name,
      cv_mime:         file.type,
      cv_text:         null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', athlete.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl, filename: file.name });
}
