import { NextResponse } from 'next/server';

/**
 * Standardized API error response.
 *
 * All portal API routes should use this for error responses
 * to ensure a consistent `{ error: string }` format.
 */
export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standardized API success response.
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
