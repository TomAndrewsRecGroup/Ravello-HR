import { redirect } from 'next/navigation';

// Go-live gap list, item 3 (2026-10-02): "keep only one" dashboard.
// Board Assurance is now the "Board Assurance" section at the bottom
// of the one consolidated Core 360 Status page — the generate/issue
// workflow itself (BoardAssuranceClient) is unchanged, just relocated.
export default async function BoardAssuranceRedirect(props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  redirect(`/health-safety/${companyId}/core-360-status`);
}
