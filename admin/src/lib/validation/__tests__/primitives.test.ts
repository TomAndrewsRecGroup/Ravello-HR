import { describe, expect, it } from 'vitest';
import {
  email, httpsUrl, longText, money, optionalEmail, optionalHttpsUrl,
  optionalStringList, percentage, shortText, stringList, uuid, z,
} from '../primitives';
import { parseBody } from '../parseBody';

describe('text bounds', () => {
  it('rejects an unbounded string — a 5MB job title was previously accepted', () => {
    expect(shortText(200).safeParse('x'.repeat(201)).success).toBe(false);
    expect(longText(100).safeParse('x'.repeat(101)).success).toBe(false);
  });
  it('rejects empty and whitespace-only required text', () => {
    expect(shortText().safeParse('').success).toBe(false);
    expect(shortText().safeParse('   ').success).toBe(false);
  });
  it('trims rather than storing padding', () => {
    expect(shortText().parse('  Head of People  ')).toBe('Head of People');
  });
});

describe('email', () => {
  it('lower-cases so one address is one row', () => {
    expect(email.parse(' Tom@Example.COM ')).toBe('tom@example.com');
  });
  it('rejects nonsense', () => {
    expect(email.safeParse('not-an-email').success).toBe(false);
  });
  it('treats blank as absent for optional fields', () => {
    expect(optionalEmail.parse('')).toBeNull();
    expect(optionalEmail.parse(undefined)).toBeNull();
  });
});

describe('urls', () => {
  it('refuses http:// — a downgrade in an email link', () => {
    expect(httpsUrl.safeParse('http://example.com').success).toBe(false);
  });
  it('refuses javascript: and data: — stored XSS vectors', () => {
    expect(httpsUrl.safeParse('javascript:alert(1)').success).toBe(false);
    expect(httpsUrl.safeParse('data:text/html,<script>').success).toBe(false);
  });
  it('accepts https', () => {
    expect(httpsUrl.parse('https://example.com/apply')).toBe('https://example.com/apply');
  });
  it('treats blank as absent', () => {
    expect(optionalHttpsUrl.parse('')).toBeNull();
  });
});

describe('numbers', () => {
  it('refuses a negative salary — always a bug, never an intention', () => {
    expect(money.safeParse(-1).success).toBe(false);
  });
  it('refuses NaN and Infinity', () => {
    expect(money.safeParse(NaN).success).toBe(false);
    expect(money.safeParse(Infinity).success).toBe(false);
  });
  it('bounds a percentage', () => {
    expect(percentage.safeParse(101).success).toBe(false);
    expect(percentage.safeParse(-1).success).toBe(false);
    expect(percentage.parse(85)).toBe(85);
  });
});

describe('lists', () => {
  it('bounds both the count and each entry — an unbounded array is an unbounded row', () => {
    expect(stringList(3).safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
    expect(stringList(10, 5).safeParse(['toolongvalue']).success).toBe(false);
  });
  it('treats a missing list as null rather than undefined', () => {
    expect(optionalStringList().parse(undefined)).toBeNull();
  });
});

describe('parseBody', () => {
  const Schema = z.object({ title: shortText(50), count: percentage });

  function req(body: string) {
    return new Request('https://x/y', { method: 'POST', body });
  }

  it('returns typed data on success', async () => {
    const r = await parseBody(req(JSON.stringify({ title: ' Hi ', count: 5 })), Schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ title: 'Hi', count: 5 });
  });

  it('answers a malformed body with 400, not a 500', async () => {
    // Letting JSON.parse throw inside the handler turns a malformed curl
    // into a pager alert.
    const r = await parseBody(req('{not json'), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it('names the offending field so a form can show it in place', async () => {
    const r = await parseBody(req(JSON.stringify({ title: '', count: 999 })), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(body.error).toMatch(/title/);
      expect(body.fields).toHaveProperty('title');
      expect(body.fields).toHaveProperty('count');
    }
  });

  it('strips unknown keys rather than passing them to the database', async () => {
    const r = await parseBody(req(JSON.stringify({ title: 'a', count: 1, is_admin: true })), Schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).not.toHaveProperty('is_admin');
  });
});
