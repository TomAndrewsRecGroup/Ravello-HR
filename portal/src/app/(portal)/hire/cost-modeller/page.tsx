import type { Metadata } from 'next';
import CostModellerClient from './CostModellerClient';

export const metadata: Metadata = { title: 'Cost Modeller' };

export default function CostModellerPage() {
  return (
    <main className="portal-page flex-1">
      <CostModellerClient />
    </main>
  );
}
