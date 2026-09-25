import { redirect } from 'next/navigation';

export default function HealthSafetyCompanyIndex({ params }: { params: { companyId: string } }) {
  redirect(`/health-safety/${params.companyId}/register`);
}
