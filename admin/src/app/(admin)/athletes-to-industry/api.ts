'use client';

import type { InterestRow, InterestStatus } from './types';

const BASE = '/api/admin';

export const interestApi = {
  async bulkCreate(athlete_id: string, items: { partner_id: string; role_opportunity_id: string | null }[]): Promise<InterestRow[]> {
    const res = await fetch(`${BASE}/interests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_id, items }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to save matches');
    return (json.rows ?? []) as InterestRow[];
  },
  async patch(id: string, body: { status?: InterestStatus; notes?: string | null }): Promise<void> {
    const res = await fetch(`${BASE}/interests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to update');
    }
  },
  async remove(id: string): Promise<void> {
    const res = await fetch(`${BASE}/interests/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to delete');
    }
  },
};
