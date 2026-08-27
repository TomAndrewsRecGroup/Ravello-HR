// GET /api/files/sign?kind=<kind>&id=<uuid>
//
// Mints a short-lived signed URL for a file in a private bucket.
//
// The `documents` bucket is private, so a `getPublicUrl()` against it
// returns a link that cannot resolve — which is what four upload sites
// were storing. Files are referenced by PATH now and signed here, at
// click time.
//
// Authorisation is RLS, not code. Both the row read and the signing use
// the CALLER'S session, so a row they cannot SELECT is simply not found
// and an object they cannot read cannot be signed. There is deliberately
// no service-role client in this file: it would bypass both checks and
// turn one query parameter into a read of every client's documents.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveFileKind, SIGNED_URL_TTL_SECONDS } from '@/lib/storage/fileKinds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const kindParam = req.nextUrl.searchParams.get('kind');
  const id        = req.nextUrl.searchParams.get('id');

  const kind = resolveFileKind(kindParam);
  if (!kind) {
    return NextResponse.json({ error: 'Unknown file kind' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // RLS applies: another company's row comes back as not-found, which is
  // the correct answer and the correct status.
  const { data: row, error } = await supabase
    .from(kind.table)
    .select(kind.column)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const path = (row as unknown as Record<string, unknown>)[kind.column];
  if (typeof path !== 'string' || !path) {
    // The row exists but holds no stored object. Callers that also have a
    // legacy `file_url` should use that instead of asking here, so this
    // says which case it is rather than a bare 404.
    return NextResponse.json({ error: 'This record has no stored file' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(kind.bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? 'Could not sign this file' },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
}
