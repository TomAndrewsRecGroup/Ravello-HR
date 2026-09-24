// Which candidates a client can still decide on (Approve / Not right /
// Request info) from the role page.
//
// 'pending' was the only one, but the admin "Send to client" button
// sets 'shared' — so every candidate sent the normal way showed up in
// the sidebar badge as waiting on the client while offering the client
// no way to answer. 'info_requested' is the same trap one step later:
// the client asked a question and then had no way to decide once it
// was answered. All three mean "the recruiter is waiting on the client".
//
// The sidebar badge (app/(portal)/layout.tsx) counts pending + shared;
// keep the two in step.
export const CLIENT_DECISION_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'shared',
  'info_requested',
]);

export function clientCanDecide(status: string | null | undefined): boolean {
  return status != null && CLIENT_DECISION_STATUSES.has(status);
}
