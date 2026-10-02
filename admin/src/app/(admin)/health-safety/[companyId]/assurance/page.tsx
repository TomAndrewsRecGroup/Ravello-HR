import { redirect } from 'next/navigation';

// Go-live gap list, item 3 (2026-10-02): "keep only one" dashboard.
// Assurance Today is now the "EHS Posture — Right Now" section of the
// one consolidated Core 360 Status page.
export default async function AssuranceTodayRedirect(props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  redirect(`/health-safety/${companyId}/core-360-status`);
}
