// Core-OS 360 Completion Programme, Phase 26, Group 1 (C14.6). A
// worker's badge needs a HUMAN-READABLE fallback identifier printed
// alongside the QR — for when a scanner can't read the code, so a
// reader falls back to a manual lookup instead (the existing person
// search / on-site roster, both of which already require a login;
// this file never becomes a new public lookup key, deliberately —
// see WorkerBadgePanel.tsx's own header comment for why).
//
// `people.employee_number` is the natural fallback: synced one-way
// from `employee_records.employee_number` since migration 184, and
// already shown elsewhere on the profile page. A contractor/
// consultant/temporary worker has no `employee_records` row and so
// often has none — the last resort is a short, upper-cased slice of
// the person's own id, clearly labelled as a reference rather than an
// employee number, so a reader is never told a fabricated number.

export function humanBadgeId(employeeNumber: string | null, personId: string): string {
  const trimmed = employeeNumber?.trim();
  if (trimmed) return trimmed;
  return `REF-${personId.replace(/-/g, '').slice(-8).toUpperCase()}`;
}
