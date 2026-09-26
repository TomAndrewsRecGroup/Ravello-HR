import type { Metadata } from 'next';
import { CheckCircle2, ClipboardList, XCircle } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { HS_TEST_SOURCE_TYPE_LABELS } from '@/lib/hs/vocab';

export const metadata: Metadata = { title: 'Tests' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Read-only: staff run tests on the client's behalf, same posture as
// the Register/Documents/Audits/Incidents/Equipment tabs — nothing
// here is self-certified. Grouped by employee (the closest this list
// gets to "under the employee record": Employee Records is an
// edit-only form with no read-only related-records tabs of its own,
// so this list is where a client sees who was tested and the result).
export default async function ProtectTestsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: assignments, error } = await supabase
    .from('hs_test_assignments')
    .select('id, employee_id, test_id, session_id, status, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = assignments ?? [];
  const employeeIds = [...new Set(rows.map(r => r.employee_id))];
  const testIds = [...new Set(rows.map(r => r.test_id))];
  const sessionIds = [...new Set(rows.map(r => r.session_id).filter((id): id is string => !!id))];
  const assignmentIds = rows.map(r => r.id);

  const [{ data: employees }, { data: tests }, { data: sessions }, { data: submissions }] = await Promise.all([
    employeeIds.length ? supabase.from('employee_records').select('id, full_name').in('id', employeeIds) : Promise.resolve({ data: [] }),
    testIds.length ? supabase.from('hs_tests').select('id, title').in('id', testIds) : Promise.resolve({ data: [] }),
    sessionIds.length ? supabase.from('hs_test_sessions').select('id, title').in('id', sessionIds) : Promise.resolve({ data: [] }),
    assignmentIds.length ? supabase.from('hs_test_submissions').select('assignment_id, score, passed, source, submitted_at').eq('company_id', companyId).in('assignment_id', assignmentIds) : Promise.resolve({ data: [] }),
  ]);

  const employeeName = new Map((employees ?? []).map(e => [e.id, e.full_name as string]));
  const testTitle = new Map((tests ?? []).map(t => [t.id, t.title as string]));
  const sessionTitle = new Map((sessions ?? []).map(s => [s.id, s.title as string]));
  const submissionByAssignment = new Map((submissions ?? []).map(s => [s.assignment_id, s]));

  // Group by employee, most recently tested first within each group.
  const byEmployee = new Map<string, typeof rows>();
  for (const a of rows) {
    const key = a.employee_id;
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key)!.push(a);
  }
  const groups = [...byEmployee.entries()]
    .map(([employeeId, items]) => ({ employeeId, name: employeeName.get(employeeId) ?? 'Former employee', items }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Tests could not be loaded. Refresh to try again.</p>}
      {groups.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <ClipboardList size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No tests recorded yet</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.employeeId} className="card p-0 overflow-hidden">
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                <p className="font-semibold text-sm" style={{ color: '#0A0F1E' }}>{group.name}</p>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr><th>Test</th><th>Session</th><th>Source</th><th>Status</th><th>Score</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {group.items.map(a => {
                      const sub = submissionByAssignment.get(a.id);
                      return (
                        <tr key={a.id}>
                          <td>{testTitle.get(a.test_id) ?? 'Test'}</td>
                          <td>{a.session_id ? sessionTitle.get(a.session_id) ?? '—' : '—'}</td>
                          <td>{HS_TEST_SOURCE_TYPE_LABELS[sub?.source as keyof typeof HS_TEST_SOURCE_TYPE_LABELS] ?? '—'}</td>
                          <td>
                            {a.status !== 'completed' ? (
                              <span className="badge badge-inprogress">Pending</span>
                            ) : sub?.passed ? (
                              <span className="inline-flex items-center gap-1" style={{ color: 'var(--teal, #14B8A6)' }}><CheckCircle2 size={14} /> Passed</span>
                            ) : (
                              <span className="inline-flex items-center gap-1" style={{ color: 'var(--red)' }}><XCircle size={14} /> Failed</span>
                            )}
                          </td>
                          <td>{sub?.score != null ? `${sub.score}%` : '—'}</td>
                          <td>{sub ? fmt(sub.submitted_at) : fmt(a.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
