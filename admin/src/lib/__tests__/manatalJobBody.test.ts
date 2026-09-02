// What actually goes on the wire to Manatal.
//
// buildManatalJobArgs.test.ts asserts the ARGS. This asserts the JSON
// body those args become, because the defect lived between the two: an
// arg of `null` was serialised as `"headcount": null`, and this body is
// used by the re-publish PATCH as well as the create.
//
// On a PATCH, null does not mean "leave it alone". It means CLEAR IT.
// So a headcount we did not hold wiped the 100 the operator had set by
// hand in Manatal — twice — and the advert then showed no headcount at
// all. Operator: "it wipes the number in Manatal and does not add the
// new one in."

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Capture the body without a network call. */
const sent: { url: string; body: any }[] = [];

beforeEach(() => {
  sent.length = 0;
  vi.resetModules();
  process.env.MANATAL_API_KEY = 'test-key';
  vi.doMock('../http/resilient', () => ({
    resilientFetch: (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body ?? '{}')) });
      return Promise.resolve({
        response: {
          ok: true, status: 200,
          headers: { get: () => null },
          text: () => Promise.resolve('{"id":1}'),
        },
        error: null,
      });
    },
  }));
});

afterEach(() => { vi.doUnmock('../http/resilient'); });

const BASE = {
  organizationId: '8136723',
  title: 'AI & Software Engineers',
  description: '<p>Role.</p>',
};

async function updateBody(args: Record<string, unknown>) {
  const { updateManatalJob } = await import('../manatal');
  await updateManatalJob('4337074', { ...BASE, ...args } as never);
  return sent.at(-1)!.body;
}

describe('an unset field must not clear the value in Manatal', () => {
  it('OMITS headcount when we do not have one', async () => {
    const body = await updateBody({ headcount: null });
    expect('headcount' in body).toBe(false);
  });

  it('sends headcount when we do have one', async () => {
    const body = await updateBody({ headcount: 100 });
    expect(body.headcount).toBe(100);
  });

  it('omits salary and currency rather than blanking them', async () => {
    // A role whose pay we have not captured must not wipe the figure
    // somebody entered in Manatal.
    const body = await updateBody({ salaryMin: null, salaryMax: null, currency: null });
    expect('salary_min' in body).toBe(false);
    expect('salary_max' in body).toBe(false);
    expect('currency'   in body).toBe(false);
  });

  it('sends salary and currency when we do hold them', async () => {
    const body = await updateBody({ salaryMin: 60, salaryMax: 120, currency: 'USD' });
    // Manatal takes salary as decimal STRINGS.
    expect(body.salary_min).toBe('60');
    expect(body.salary_max).toBe('120');
    expect(body.currency).toBe('USD');
  });

  it('never sends a null for ANY optional field', async () => {
    // The general rule, so a field added later cannot reintroduce this
    // by being defaulted to null in the args.
    const body = await updateBody({
      headcount: null, salaryMin: null, salaryMax: null, currency: null,
      contractDetails: null, frequency: null, isSalaryVisible: null,
      industryId: null, isRemote: null,
    });
    const nulls = Object.entries(body).filter(([, v]) => v === null).map(([k]) => k);
    // external_id is deliberately nullable — it is OUR id and clearing
    // it on a role we no longer track is correct.
    expect(nulls.filter(k => k !== 'external_id')).toEqual([]);
  });

  it('does not touch the publish flags — that is a separate call', async () => {
    // The field PATCH must not flip a job live or dark as a side effect.
    const body = await updateBody({ headcount: 100 });
    expect('is_published' in body).toBe(false);
    expect('status' in body).toBe(false);
    expect('organization' in body).toBe(false);
  });
});

describe('the create still carries what it should', () => {
  it('sets organization and the publish flags, unlike the update', async () => {
    const { createManatalJob } = await import('../manatal');
    await createManatalJob({ ...BASE, headcount: 2, currency: 'GBP', salaryMin: 40000 } as never);
    const body = sent.at(-1)!.body;
    expect(body.organization).toBe(8136723);
    expect(body.status).toBe('active');
    expect(body.is_published).toBe(false);
    expect(body.headcount).toBe(2);
    expect(body.salary_min).toBe('40000');
  });
});
