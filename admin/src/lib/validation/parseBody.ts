// One way to read and validate a request body.
//
// Every route used to do its own `const { a, b } = await req.json()`,
// which fails in two ways nobody sees: a malformed body throws inside
// the handler and becomes a 500 rather than a 400, and every field
// arrives as `any` with no bound on its size or shape.
//
// This returns a discriminated result rather than throwing, so a route
// reads:
//
//     const parsed = await parseBody(req, MySchema);
//     if (!parsed.ok) return parsed.response;
//     const { title } = parsed.data;      // typed, trimmed, bounded
//
// — the same shape as requireStaff(), so the two compose without a
// house style argument.

import { NextResponse } from 'next/server';
import type { z } from 'zod';

export type ParseOk<T>  = { ok: true;  data: T };
export type ParseFail   = { ok: false; response: NextResponse };
export type ParseResult<T> = ParseOk<T> | ParseFail;

/** Field-level errors, shaped so a form can put each message next to
 *  the input that caused it instead of showing one generic failure. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // A body that will not parse is a client error. Letting it throw
    // inside the handler makes it a 500 and pages somebody at 3am for a
    // malformed curl.
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    const first = Object.entries(fields)[0];
    return {
      ok: false,
      response: NextResponse.json(
        {
          // A single readable sentence for a toast, plus the per-field
          // map for a form. Returning only "Validation failed" makes the
          // caller guess.
          error: first ? `${first[0]}: ${first[1]}` : 'Invalid request body',
          fields,
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: result.data };
}

/** Same contract for multipart forms (uploads, the email composer).
 *  Values arrive as strings, so the schema should coerce what it needs. */
export async function parseForm<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>> & { form?: FormData }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request body must be valid form data' }, { status: 400 }),
    };
  }

  const raw: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') raw[k] = v;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    const first = Object.entries(fields)[0];
    return {
      ok: false,
      response: NextResponse.json(
        { error: first ? `${first[0]}: ${first[1]}` : 'Invalid form data', fields },
        { status: 400 },
      ),
    };
  }

  // The FormData comes back too, because file parts are not in the
  // parsed object and the caller still needs them.
  return { ok: true, data: result.data, form };
}
