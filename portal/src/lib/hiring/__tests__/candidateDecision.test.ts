import { describe, expect, it } from 'vitest';
import { clientCanDecide } from '../candidateDecision';

// The admin "Send to client" button sets client_status = 'shared', and
// the Approve / Not right / Request info buttons appeared only for
// 'pending' — so every candidate sent the normal way was counted in the
// client's badge as waiting on them while offering no way to answer.

describe('clientCanDecide', () => {
  it.each(['pending', 'shared', 'info_requested'])('%s: the client can still decide', (s) => {
    expect(clientCanDecide(s)).toBe(true);
  });

  it.each(['approved', 'rejected', 'hired', '', null, undefined])('%s: no decision buttons', (s) => {
    expect(clientCanDecide(s as any)).toBe(false);
  });
});
