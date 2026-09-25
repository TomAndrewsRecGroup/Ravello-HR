import { redirect } from 'next/navigation';

export default async function HealthSafetyCompanyIndex(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  redirect(`/health-safety/${params.companyId}/register`);
}
