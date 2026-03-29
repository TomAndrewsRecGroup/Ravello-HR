import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { randomBytes, createHash } from 'crypto';

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const VALID_PERMISSIONS = ['bd_pipeline', 'role_analyze', 'company_lens'] as const;

// GET — list all API keys (hashes hidden, only prefix + metadata)
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['ravello_admin', 'ravello_recruiter'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: keys, error } = await supabase
    .from('partner_api_keys')
    .select('id, label, key_prefix, permissions, is_active, last_used_at, created_at, revoked_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: keys ?? [] });
}

// POST — create a new API key
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'ravello_admin') {
    return NextResponse.json({ error: 'Only admins can create API keys' }, { status: 403 });
  }

  const body = await req.json();
  const label: string = (body.label ?? '').trim();
  const permissions: string[] = (body.permissions ?? []).filter(
    (p: string) => VALID_PERMISSIONS.includes(p as any),
  );

  if (!label) return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  if (permissions.length === 0) {
    return NextResponse.json({ error: 'At least one permission is required' }, { status: 400 });
  }

  // Generate key: ivl_ + 32 random hex chars
  const raw = `ivl_${randomBytes(16).toString('hex')}`;
  const prefix = raw.slice(0, 8);

  const { data: key, error } = await supabase
    .from('partner_api_keys')
    .insert({
      label,
      key_hash: hashKey(raw),
      key_prefix: prefix,
      permissions,
      created_by: user.id,
    })
    .select('id, label, key_prefix, permissions, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the raw key ONCE — it will never be shown again
  return NextResponse.json({ key: { ...key, raw_key: raw } }, { status: 201 });
}

// PATCH — revoke a key
export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'ravello_admin') {
    return NextResponse.json({ error: 'Only admins can revoke API keys' }, { status: 403 });
  }

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'Key id required' }, { status: 400 });

  const { error } = await supabase
    .from('partner_api_keys')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
