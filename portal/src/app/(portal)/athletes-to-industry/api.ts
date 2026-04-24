'use client';

import type { InterestRow, InterestStatus } from './types';

// Both the portal and the staff-side admin wrapper call this picker.
// Pass a base ('/api' for portal users, '/api/admin' for staff inside
// the admin app) and the helper builds full URLs.
export interface InterestApi {
  bulkCreate(athlete_id: string, items: { partner_id: string; role_opportunity_id: string | null }[]): Promise<InterestRow[]>;
  patch(id: string, body: { status?: InterestStatus; notes?: string | null }): Promise<void>;
  remove(id: string): Promise<void>;
}

export function makeInterestApi(base: '/api' | '/api/admin'): InterestApi {
  return {
    async bulkCreate(athlete_id, items) {
      const res = await fetch(`${base}/interests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athlete_id, items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save matches');
      return (json.rows ?? []) as InterestRow[];
    },
    async patch(id, body) {
      const res = await fetch(`${base}/interests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to update');
      }
    },
    async remove(id) {
      const res = await fetch(`${base}/interests/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to delete');
      }
    },
  };
}
