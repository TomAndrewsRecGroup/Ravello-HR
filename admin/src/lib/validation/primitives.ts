// Shared validation primitives.
//
// RLS answers "who may write to this row". It does not answer "what may
// be written". Those are different questions and only one of them was
// being asked: zod was a dependency used on 2 of 88 API routes, while
// 142 writes went straight from the browser with the public anon key.
//
// Nothing enforced string length, numeric range, required fields, or
// shape. A client could put a five-megabyte string in a job title, a
// negative figure in a salary, or malformed JSON in a settings blob —
// and the three enum bugs fixed earlier this week were the same gap
// showing through: a value reached the database that no layer had
// checked.
//
// These primitives exist so every schema bounds its inputs the same
// way. A field with no explicit ceiling is a field with a ceiling of
// "whatever the request body limit is".

import { z } from 'zod';

/* ─── Text ─────────────────────────────────────────────────── */

/** Short free text — names, titles, labels. */
export const shortText = (max = 200) =>
  z.string().trim().min(1, 'Required').max(max, `Must be ${max} characters or fewer`);

export const optionalShortText = (max = 200) =>
  z.string().trim().max(max).optional().nullable().transform(v => v || null);

/** Long free text — descriptions, notes, JD bodies. 20k is roughly
 *  8 pages; beyond that it is a document, not a field. */
export const longText = (max = 20_000) =>
  z.string().trim().max(max, `Must be ${max} characters or fewer`);

export const optionalLongText = (max = 20_000) =>
  z.string().trim().max(max).optional().nullable().transform(v => v || null);

/** HTML bodies (email composer, rich text). Larger ceiling because
 *  markup inflates, but still bounded. */
export const htmlBody = (max = 200_000) =>
  z.string().min(1, 'Required').max(max, 'Content is too large to send');

/* ─── Identity ─────────────────────────────────────────────── */

export const uuid = z.string().uuid('Must be a valid id');
export const optionalUuid = z.string().uuid().optional().nullable().transform(v => v || null);

/** Lower-cased and trimmed, so 'Tom@X.com ' and 'tom@x.com' are one
 *  address rather than two rows. */
// .max() must precede .toLowerCase(): the latter returns a ZodEffects,
// which has no length methods.
export const email = z.string().trim().max(320).email('Must be a valid email address').toLowerCase();
export const optionalEmail = z.union([z.literal(''), email])
  .optional()
  .nullable()
  .transform((v: string | null | undefined) => v || null);

/** Deliberately permissive: international formats vary far more than
 *  most regexes allow, and rejecting a valid number is worse than
 *  storing an odd one. */
export const phone = z.string().trim().max(40).optional().nullable().transform(v => v || null);

/** https only. An http:// link in an email is a downgrade, and a
 *  javascript: or data: URL in a stored field is an XSS vector. */
// Length bounds go BEFORE .refine() — refine returns a ZodEffects,
// which has no string methods left on it.
export const httpsUrl = z.string().trim().max(2048).url('Must be a valid URL')
  .refine((u: string) => u.startsWith('https://'), 'Must be an https:// address');
export const optionalHttpsUrl = z.union([z.literal(''), httpsUrl])
  .optional()
  .nullable()
  .transform((v: string | null | undefined) => v || null);

/* ─── Numbers and dates ────────────────────────────────────── */

/** Money in whole units. Non-negative because a negative salary or fee
 *  is always a bug, never an intention. */
export const money = z.number().finite().min(0, 'Cannot be negative').max(100_000_000);
export const optionalMoney = money.optional().nullable();

export const percentage = z.number().int().min(0).max(100);
export const smallCount = z.number().int().min(0).max(10_000);

export const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date (YYYY-MM-DD)');
export const optionalIsoDate = isoDate.optional().nullable().or(z.literal('')).transform(v => v || null);
export const isoDateTime = z.string().trim().datetime({ offset: true });

/* ─── Collections ──────────────────────────────────────────── */

/** Bounded on both the number of entries and the size of each. An
 *  unbounded array is an unbounded row. */
export const stringList = (maxItems = 50, maxLen = 200) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems);

export const optionalStringList = (maxItems = 50, maxLen = 200) =>
  stringList(maxItems, maxLen).optional().nullable().transform(v => v ?? null);

/** An enum value, checked against the live vocabulary rather than a
 *  hand-copied list. Pass the `as const` tuple from statusMaps.ts so a
 *  migration that changes the enum changes this too. */
export const enumOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export { z };
