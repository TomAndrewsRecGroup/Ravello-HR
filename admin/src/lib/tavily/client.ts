// Core-OS 360 Phase 17: Regulatory Intelligence → Action.
//
// Tavily is a web-search API — this file is the ONE place it is ever
// called, and it is a plain search: it returns titles, URLs and short
// content snippets, exactly what a paralegal would get running the
// same query by hand. It NEVER decides anything, NEVER writes a
// verdict, and its own results are never paraphrased by an LLM —
// summariseResults() below is a verbatim join of what Tavily returned,
// clipped to fit the storage column, never a generated summary. Only
// a human, reading legal_requirement_research_notes.raw_result_summary
// on the staff-only Legal Register page, decides what — if anything —
// to do about it.
//
// Server-only. TAVILY_API_KEY must never reach the client; this module
// is imported only from API routes.

import { resilientFetch } from '@/lib/http/resilient';

const API_URL = process.env.TAVILY_API_URL ?? 'https://api.tavily.com/search';
const API_KEY = process.env.TAVILY_API_KEY ?? '';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export interface TavilySearchOutcome {
  results: TavilyResult[] | null;
  error: string | null;
}

export async function tavilySearch(query: string): Promise<TavilySearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { results: null, error: 'A search query is required' };
  if (!API_KEY) return { results: null, error: 'TAVILY_API_KEY is not configured' };

  // A search is a read, whatever HTTP method the vendor's own API uses
  // to carry the query body — safe to retry, unlike a write.
  const { response, error } = await resilientFetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: API_KEY, query: trimmed, max_results: 5, search_depth: 'basic' }),
  }, { vendor: 'tavily', retryOnWrite: true, timeoutMs: 20_000 });

  if (error || !response) return { results: null, error: error ?? 'No response from Tavily' };
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { results: null, error: `Tavily returned HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}` };
  }

  const body = await response.json().catch(() => null);
  if (!body || !Array.isArray(body.results)) return { results: null, error: 'Unexpected response shape from Tavily' };

  const results: TavilyResult[] = body.results.map((r: Record<string, unknown>) => ({
    title: String(r.title ?? '').slice(0, 300),
    url: String(r.url ?? ''),
    content: String(r.content ?? '').slice(0, 1000),
  }));
  return { results, error: null };
}

/** A verbatim join of Tavily's own titles/urls/content — never an
 *  AI-generated paraphrase — clipped to legal_requirement_research_
 *  notes.raw_result_summary's own 4000-char DB limit (migration 159). */
export function summariseResults(results: TavilyResult[]): string {
  if (results.length === 0) return 'Tavily returned no results for this query.';
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.content}`.trim());
  return lines.join('\n\n').slice(0, 4000);
}

/** The default query for a legal requirement — staff may override it. */
export function defaultQueryFor(title: string, jurisdiction: string): string {
  return `${title} ${jurisdiction} recent changes updates`.trim().slice(0, 500);
}
