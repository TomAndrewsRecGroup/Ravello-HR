// The link a referral candidate is actually sent.
//
// This is the one artefact in the pipeline that a stranger clicks and a
// partner pays a fee against. Two ways it can be wrong, both silent:
// a value that corrupts the query string, and a token nobody can fill
// that ships literally to every candidate on the role.

import { describe, expect, it } from 'vitest';
import {
  REFERRAL_URL_SAMPLE,
  REFERRAL_URL_TOKEN_NAMES,
  buildReferralUrl,
  findUnknownTokens,
  hasTokens,
} from '../referralUrl';

const BASE = 'https://apply.micro1.ai/roles?ref=arg';

describe('buildReferralUrl', () => {
  it('fills a per-candidate identifier', () => {
    const out = buildReferralUrl(`${BASE}&cid={ref}`, { ref: 'abc-123' });
    expect(out).toBe(`${BASE}&cid=abc-123`);
  });

  it('URL-ENCODES every value', () => {
    // The rule this module exists for. A plus-address, a space and an
    // apostrophe all break a hand-built query string; unencoded, the
    // candidate lands on a broken page holding an email that says we
    // reviewed their CV.
    const out = buildReferralUrl(`${BASE}&e={email}&n={name}`, {
      email: "siobhan.o'brien+jobs@example.com",
      name:  'Siobhán O’Brien',
    });
    // The two that actually corrupt a query string: "+" would decode as
    // a space and lose the plus-address, "@" and the space in the name
    // must not sit raw in the URL.
    expect(out).toContain('%2Bjobs');   // + encoded
    expect(out).toContain('%40');       // @ encoded
    expect(out).not.toContain(' ');
    // (encodeURIComponent leaves "'" alone by design — it is legal in a
    // query value and round-trips, as the assertions below show.)
    expect(() => new URL(out)).not.toThrow();
    expect(new URL(out).searchParams.get('n')).toBe('Siobhán O’Brien');
    expect(new URL(out).searchParams.get('e')).toBe("siobhan.o'brien+jobs@example.com");
  });

  it('substitutes every token the panel offers', () => {
    // Binds the advertised list to the implementation: a token shown in
    // the UI that the builder cannot fill would ship literally.
    for (const token of REFERRAL_URL_TOKEN_NAMES) {
      const out = buildReferralUrl(`${BASE}&v={${token}}`, REFERRAL_URL_SAMPLE);
      expect(out, `token {${token}} was not substituted`).not.toContain(`{${token}}`);
    }
  });

  it('leaves an EMPTY value, never the literal token', () => {
    // A candidate with no name must yield "?n=", which is harmless.
    // "?n={name}" is not.
    const out = buildReferralUrl(`${BASE}&n={name}`, { name: null });
    expect(out).toBe(`${BASE}&n=`);
    expect(out).not.toContain('{name}');
  });

  it('handles a URL with no tokens at all', () => {
    expect(buildReferralUrl(BASE, REFERRAL_URL_SAMPLE)).toBe(BASE);
  });

  it('repeats a token used more than once', () => {
    const out = buildReferralUrl(`${BASE}&a={ref}&b={ref}`, { ref: 'X' });
    expect(out).toBe(`${BASE}&a=X&b=X`);
  });

  it('leaves an unknown token alone rather than deleting it', () => {
    // It cannot reach here — the config route refuses to save one — but
    // silently deleting it would turn a mistake that is VISIBLE in the
    // link into a query parameter that is merely missing.
    const out = buildReferralUrl(`${BASE}&n={firstname}`, REFERRAL_URL_SAMPLE);
    expect(out).toContain('{firstname}');
  });
});

describe('findUnknownTokens — the typo guard', () => {
  it('catches a plausible misspelling', () => {
    // "{firstname}" for "{first_name}". Left alone, every candidate
    // arrives at the partner as "?name=%7Bfirstname%7D" and nobody
    // notices until a fee reconciliation fails weeks later.
    expect(findUnknownTokens(`${BASE}&n={firstname}`)).toEqual(['firstname']);
  });

  it('accepts every token the panel advertises', () => {
    const all = REFERRAL_URL_TOKEN_NAMES.map(t => `{${t}}`).join('&x=');
    expect(findUnknownTokens(`${BASE}&x=${all}`)).toEqual([]);
  });

  it('reports each unknown once, however often it appears', () => {
    expect(findUnknownTokens(`${BASE}&a={nope}&b={nope}&c={alsonope}`))
      .toEqual(['nope', 'alsonope']);
  });

  it('ignores a brace that is not a token', () => {
    expect(findUnknownTokens('https://x.com/a{}b')).toEqual([]);
    expect(findUnknownTokens('https://x.com/{not a token}')).toEqual([]);
  });
});

describe('hasTokens', () => {
  it('is true only when a parameter is actually used', () => {
    expect(hasTokens(`${BASE}&cid={ref}`)).toBe(true);
    expect(hasTokens(BASE)).toBe(false);
    expect(hasTokens('')).toBe(false);
  });

  it('does not carry regex state between calls', () => {
    // A module-level regex with /g holds lastIndex. Two identical calls
    // returning different answers is the classic version of this bug.
    const url = `${BASE}&cid={ref}`;
    expect(hasTokens(url)).toBe(true);
    expect(hasTokens(url)).toBe(true);
    expect(hasTokens(url)).toBe(true);
  });
});
