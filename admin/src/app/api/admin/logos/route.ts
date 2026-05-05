import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_BYTES = 2 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
};

const KIND_TABLE: Record<string, string> = {
  company:           'companies',
  partner:           'partners',
  training_provider: 'training_providers',
};

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const kind     = String(form.get('kind') ?? '');
  const targetId = String(form.get('targetId') ?? '');
  const file     = form.get('file');

  const table = KIND_TABLE[kind];
  if (!table)                       return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  if (!UUID_RE.test(targetId))      return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });
  if (!(file instanceof File))      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });
  if (file.size > MAX_BYTES)        return NextResponse.json({ error: 'File too large (2 MB max)' }, { status: 413 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const ext  = MIME_EXT[file.type] ?? 'png';
  // Path includes a cache-buster timestamp so a replacement logo
  // doesn't get served stale by browsers/CDNs that cached the old
  // public URL.
  const path = `${kind}/${targetId}/${Date.now()}.${ext}`;

  const sb = serviceClient();
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from('logos').upload(path, buf, {
    contentType: file.type,
    upsert:      false,
    cacheControl: '604800', // 7-day cache; new uploads get a new path
  });
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data: pub } = sb.storage.from('logos').getPublicUrl(path);
  const url = pub.publicUrl;

  // Best-effort: clean up the previous logo so we don't accumulate
  // orphan files. We read the row first to get the previous URL,
  // then derive the storage path from it.
  const { data: existing } = await sb
    .from(table)
    .select('logo_url')
    .eq('id', targetId)
    .maybeSingle();

  const { error: dbErr } = await sb
    .from(table)
    .update({ logo_url: url })
    .eq('id', targetId);

  if (dbErr) {
    // Roll back the upload so we don't leave a dangling file.
    await sb.storage.from('logos').remove([path]).catch(() => {});
    return NextResponse.json({ error: `DB update failed: ${dbErr.message}` }, { status: 500 });
  }

  // Cleanup of the previous file (after successful row update).
  const prevUrl = (existing as any)?.logo_url as string | null | undefined;
  if (prevUrl) {
    const idx = prevUrl.indexOf('/logos/');
    if (idx >= 0) {
      const prevPath = prevUrl.slice(idx + '/logos/'.length).split('?')[0];
      if (prevPath && prevPath !== path) {
        await sb.storage.from('logos').remove([prevPath]).catch(() => {});
      }
    }
  }

  auditLog({
    action:      'logo.uploaded',
    actor_id:    auth.userId,
    target_id:   targetId,
    target_type: kind,
    metadata:    { url, size: file.size, type: file.type },
  });

  if (kind === 'company') {
    revalidateTag(`client:${targetId}`);
    revalidatePath('/clients');
    revalidatePath(`/clients/${targetId}`);
  } else {
    revalidatePath('/athletes-to-industry');
  }

  return NextResponse.json({ success: true, url });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: { kind?: string; targetId?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const table = KIND_TABLE[body.kind ?? ''];
  if (!table)                              return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  if (!body.targetId || !UUID_RE.test(body.targetId)) {
    return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });
  }

  const sb = serviceClient();

  const { data: existing } = await sb
    .from(table)
    .select('logo_url')
    .eq('id', body.targetId)
    .maybeSingle();

  const { error: dbErr } = await sb
    .from(table)
    .update({ logo_url: null })
    .eq('id', body.targetId);

  if (dbErr) {
    return NextResponse.json({ error: `DB update failed: ${dbErr.message}` }, { status: 500 });
  }

  const prevUrl = (existing as any)?.logo_url as string | null | undefined;
  if (prevUrl) {
    const idx = prevUrl.indexOf('/logos/');
    if (idx >= 0) {
      const prevPath = prevUrl.slice(idx + '/logos/'.length).split('?')[0];
      if (prevPath) await sb.storage.from('logos').remove([prevPath]).catch(() => {});
    }
  }

  auditLog({
    action:      'logo.removed',
    actor_id:    auth.userId,
    target_id:   body.targetId,
    target_type: body.kind!,
  });

  if (body.kind === 'company') {
    revalidateTag(`client:${body.targetId}`);
    revalidatePath('/clients');
    revalidatePath(`/clients/${body.targetId}`);
  } else {
    revalidatePath('/athletes-to-industry');
  }

  return NextResponse.json({ success: true });
}
