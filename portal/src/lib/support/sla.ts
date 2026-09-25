// The service-request SLA, mirrored from migration 101's
// service_request_sla() trigger (sla.test.ts pins the two together).
// Urgency is whatever the form wrote ('Urgent', 'urgent', null); the
// clock runs from the row's own created_at.

export const SLA_HOURS = { urgent: 4, high: 24, normal: 72, low: 72 } as const;
export type SlaUrgency = keyof typeof SLA_HOURS;

export function normaliseUrgency(urgency: string | null | undefined): SlaUrgency {
  const u = (urgency ?? '').trim().toLowerCase();
  return u === 'urgent' || u === 'high' || u === 'low' ? u : 'normal';
}

export function slaHours(urgency: string | null | undefined): number {
  return SLA_HOURS[normaliseUrgency(urgency)];
}

export function slaDueAt(createdAt: string | Date, urgency: string | null | undefined): Date {
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt.getTime();
  return new Date(t + slaHours(urgency) * 3_600_000);
}

/** Hours left on the clock; negative when breached. */
export function slaHoursLeft(slaDue: string | null | undefined, now: Date = new Date()): number | null {
  if (!slaDue) return null;
  return Math.round(((Date.parse(slaDue) - now.getTime()) / 3_600_000) * 10) / 10;
}
