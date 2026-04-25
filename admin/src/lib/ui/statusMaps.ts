// Shared lookup tables for ticket status badges + hiring stage labels.
// Replaces the same `Record<string, string>` re-declared inline in 4+
// admin and portal pages.

/** Tailwind class fragment for the ticket-status badge. */
export const TICKET_STATUS_BADGE: Record<string, string> = {
  open:        'badge-open',
  in_progress: 'badge-inprogress',
  resolved:    'badge-resolved',
  closed:      'badge-normal',
};

/** Display label for each stage in the hiring funnel. */
export const HIRING_STAGE_LABELS: Record<string, string> = {
  submitted:       'Submitted',
  in_progress:     'In Progress',
  shortlist_ready: 'Shortlist Ready',
  interview:       'Interview',
  offer:           'Offer',
  filled:          'Filled',
  cancelled:       'Cancelled',
};
