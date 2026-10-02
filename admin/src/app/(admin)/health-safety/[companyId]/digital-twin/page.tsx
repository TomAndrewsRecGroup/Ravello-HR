import { redirect } from 'next/navigation';

// Go-live gap list, item 3 (2026-10-02): "keep only one" dashboard.
// Digital Twin is now a section of the one consolidated Core 360
// Status page (EHS Posture — Right Now, which embeds the identical
// five-area Compliance Digital Twin this page used to render on its
// own) — this route is kept only so an old bookmark or sidebar link
// still lands somewhere real, never a 404.
export default async function DigitalTwinRedirect(props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  redirect(`/health-safety/${companyId}/core-360-status`);
}
