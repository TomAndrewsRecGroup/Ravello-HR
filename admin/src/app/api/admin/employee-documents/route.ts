import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth/requireStaff';

// POST /api/admin/employee-documents
// Multipart upload from the admin client profile → PROTECT tab.
// Stores the file in the 'documents' bucket under
//   <company_id>/employee/<timestamp>_<safe-name>
// then inserts a row into employee_documents.

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/heic', 'image/webp',
]);

function safeName(name: string): string {
  return name.replace(/[^a-z0-9.\-_]+/gi, '-');
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const file = form.get('file');
  const company_id    = String(form.get('company_id') ?? '').trim();
  const employee_name = String(form.get('employee_name') ?? '').trim();
  const doc_type      = String(form.get('doc_type') ?? 'other').trim();
  const title         = String(form.get('title') ?? '').trim();
  const expiry_date   = String(form.get('expiry_date') ?? '').trim() || null;

  if (!company_id) return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  if (!employee_name) return NextResponse.json({ error: 'employee_name is required' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
  if (file.size === 0)    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Only PDF or image files are allowed' }, { status: 400 });
  }

  const sb = adminClient();
  const path = `${company_id}/employee/${Date.now()}_${safeName(file.name)}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  // file_storage_path is the canonical reference (mig 062). file_url
  // is retained for backward compat with existing readers but should
  // not be used by new code — sign on demand via lib/storage/files.ts.
  const { data: pub } = sb.storage.from('documents').getPublicUrl(path);
  const file_url = pub?.publicUrl ?? null;

  const { data: row, error: insErr } = await sb.from('employee_documents').insert({
    company_id,
    employee_name,
    doc_type,
    title:             title || file.name,
    file_url,           // legacy compat
    file_storage_path: path,         // canonical
    file_size:         file.size,
    expiry_date,
    status:            'active',
  }).select('id').single();

  if (insErr) {
    return NextResponse.json({ error: `DB insert failed: ${insErr.message}` }, { status: 500 });
  }

  revalidatePath('/compliance');
  revalidateTag(`client:${company_id}`);

  return NextResponse.json({ id: row?.id, file_url });
}
