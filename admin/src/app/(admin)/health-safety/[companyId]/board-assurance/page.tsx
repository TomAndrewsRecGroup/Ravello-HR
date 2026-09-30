import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import BoardAssuranceClient, { type BoardAssuranceReportRow } from '@/components/hs/BoardAssuranceClient';
import type { BoardAssuranceReportData } from '@/lib/boardAssurance/computeReport';

export const metadata: Metadata = { title: 'Board Assurance' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 13, Group 2. Staff generate a draft, review it,
// then issue it — the client's board can only ever see an ISSUED
// report (board_assurance_reports_client_read, migration 178). Staff
// see every report regardless of status here, since drafting and
// reviewing is exactly what this page is for.
export default async function BoardAssurancePage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: company }, { data: reports, error }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', params.companyId).single(),
    supabase.from('board_assurance_reports')
      .select('id, year, quarter, status, report_data, issued_at')
      .eq('company_id', params.companyId)
      .order('year', { ascending: false }).order('quarter', { ascending: false })
      .limit(40),
  ]);

  const reportIds = (reports ?? []).map(r => r.id as string);
  const { data: acks } = reportIds.length > 0
    ? await supabase.from('board_assurance_acknowledgements').select('report_id').in('report_id', reportIds)
    : { data: [] as { report_id: string }[] };
  const ackCounts = new Map<string, number>();
  for (const a of acks ?? []) ackCounts.set(a.report_id, (ackCounts.get(a.report_id) ?? 0) + 1);

  const rows: BoardAssuranceReportRow[] = (reports ?? []).map(r => ({
    id: r.id as string,
    year: r.year as number,
    quarter: r.quarter as number,
    status: r.status as 'draft' | 'issued',
    issuedAt: r.issued_at as string | null,
    data: r.report_data as BoardAssuranceReportData,
    acknowledgementCount: ackCounts.get(r.id as string) ?? 0,
  }));

  return (
    <BoardAssuranceClient
      companyId={params.companyId}
      companyName={company?.name ?? 'This client'}
      reports={rows}
      loadError={error?.message ?? null}
    />
  );
}
