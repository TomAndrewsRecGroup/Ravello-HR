import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PatchBody {
  display_name?: string;
  feed_url?: string;
  category?: string | null;
  active?: boolean;
  scrape_config?: unknown;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.display_name !== undefined) {
    const v = body.display_name.trim();
    if (!v) return NextResponse.json({ error: 'display_name cannot be empty' }, { status: 400 });
    patch.display_name = v;
  }
  if (body.feed_url !== undefined) {
    const v = body.feed_url.trim();
    try {
      const u = new URL(v);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    } catch {
      return NextResponse.json({ error: 'feed_url must be a valid http(s) URL' }, { status: 400 });
    }
    patch.feed_url = v;
  }
  if (body.category !== undefined) patch.category = body.category?.trim() || null;
  if (body.active !== undefined) patch.active = !!body.active;
  if (body.scrape_config !== undefined) {
    if (body.scrape_config === null) {
      patch.scrape_config = null;
    } else if (typeof body.scrape_config === 'object' && !Array.isArray(body.scrape_config)) {
      const c = body.scrape_config as Record<string, unknown>;
      if (c.item !== undefined && (typeof c.item !== 'string' || !c.item.trim())) {
        return NextResponse.json({ error: 'scrape_config.item must be a non-empty CSS selector' }, { status: 400 });
      }
      patch.scrape_config = c;
    } else {
      return NextResponse.json({ error: 'scrape_config must be a JSON object or null' }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('feed_sources').update(patch).eq('id', params.id);
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
  const { error } = await supabase.from('feed_sources').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
