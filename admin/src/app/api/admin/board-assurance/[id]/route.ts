import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';

export const runtime = 'nodejs';

const Schema = z.object({ action: z.literal('issue') });

// Core-OS 360 Phase 13, Group 2. The ONLY session-side transition this
// table's own guard (board_assurance_reports_guard(), migration 178)
// allows after generation: draft -> issued. The guard itself refuses
// everything else (report_data, year, quarter, company_id changes; an
// un-issue) regardless of what this route sends — this route asks,
// the database decides, the same posture every H&S workflow guard in
// this codebase already takes.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, Schema);
  if (!parsed.ok) return parsed.response;

  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('board_assurance_reports')
    .update({ status: 'issued' }, { count: 'exact' })
    .eq('id', params.id)
    .select('id, status, issued_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  return NextResponse.json({ id: data.id, status: data.status, issuedAt: data.issued_at });
}
