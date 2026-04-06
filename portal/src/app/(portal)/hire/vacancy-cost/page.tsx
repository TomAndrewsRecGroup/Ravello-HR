import type { Metadata } from 'next';
import VacancyCostClient from './VacancyCostClient';

export const metadata: Metadata = { title: 'Vacancy Cost Calculator' };

export default function VacancyCostPage() {
  return (
    <main className="portal-page flex-1">
      <VacancyCostClient />
    </main>
  );
}
