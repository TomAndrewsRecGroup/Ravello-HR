import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';
import { z, uuid, optionalShortText } from '@/lib/validation/primitives';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

const BODY = z.object({
  companyId: uuid,
  reportId:  uuid,
  period:    optionalShortText(40),
});

// POST /api/admin/value-reports/audit
//
// Core-OS 360 Phase 6, Group 7 (section 13): records
// 'value_report.generated' — a client component (ValueReportClient.tsx's
// saveReport()) cannot call admin/src/lib/audit.ts directly, since that
// module writes through the SERVICE-ROLE audit_log() RPC and the
// service-role key must never reach the browser. This route exists
// ONLY to record that one event, scoped narrowly rather than as a
// general-purpose audit endpoint: the action string is fixed, never
// taken from the request body, and the report/company ids are only
// ever used as opaque identifiers in the audit row, never to read or
// write anything else.
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, BODY);
  if (!parsed.ok) return parsed.response;
  const { companyId, reportId, period } = parsed.data;

  auditLog({
    action:          'value_report.generated',
    actor_id:        auth.userId,
    target_id:       reportId,
    target_type:     'reports',
    organisation_id: companyId,
    metadata:        period ? { period } : {},
  });

  return NextResponse.json({ ok: true });
}
