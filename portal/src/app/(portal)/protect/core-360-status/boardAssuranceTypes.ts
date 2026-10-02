import type { ComplianceTwinSnapshot } from '@/lib/complianceTwin/assemble';

// A narrow, display-only view of admin's own BoardAssuranceReportData
// (admin/src/lib/boardAssurance/computeReport.ts) — naming only the
// fields this read-only page actually renders (overallBand, trend,
// complianceTwin.areas), the same "declare a narrow local interface
// naming only the fields this file reads" precedent the Digital Twin's
// own Group 2 comment already established for its two admin-only KPI
// inputs. portfolioCounts/latestManagementReview/companyId/generatedAt
// are present in the real JSON but unused here, so they are not typed.
export interface BoardAssuranceReportData {
  overallBand: 'red' | 'amber' | 'green';
  trend: 'improved' | 'declined' | 'unchanged' | null;
  complianceTwin: ComplianceTwinSnapshot;
}
