// Pins migration 088's guards. The live database is the real check
// (supabase/probes/088_security_hardening.sql, run 2026-09-24 against
// production: twelve attacks blocked, ordinary edits unaffected); this
// stops the migration file drifting from what was applied, AND stops the
// portal growing a write the guard would refuse.
//
// The guards are allow-lists: a non-staff caller may change ONLY the
// listed columns. The first version of 088 guarded named columns instead
// and the review found four it had missed (email, invite_token,
// manatal_client_id, ivylens_company_id) plus DELETE-then-INSERT. So:
//
//   * the lists are pinned EXACTLY — widening one is a security decision
//     and has to show up in a diff of this file;
//   * every portal write made with the user's own session is scanned,
//     and a column outside the list fails here rather than as a 42501 a
//     client sees on Save.

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../../../..');
const MIGRATIONS = join(REPO, 'supabase/migrations');
const sql = readFileSync(join(MIGRATIONS, '088_security_hardening.sql'), 'utf8');

// The LATEST migration that (re)defines a function is what is live —
// 093 replaced 088's profile guard — so pin that one, not the first.
function body(fn: string): string {
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
  for (const f of files.reverse()) {
    const src = readFileSync(join(MIGRATIONS, f), 'utf8');
    const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    if (start > -1) return src.slice(start, src.indexOf('$$;', start));
  }
  throw new Error(`no migration defines ${fn}`);
}

function allowList(fn: string): string[] {
  const m = body(fn).match(/self_service CONSTANT text\[\] := ARRAY\[([\s\S]*?)\];/);
  expect(m, `${fn} has no self_service allow-list`).not.toBeNull();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort();
}

const PROFILE_SELF_SERVICE = [
  'avatar_url', 'data_erasure_requested_at', 'data_processing_consent', 'full_name',
  'marketing_consent', 'onboarding_completed', 'onboarding_step',
  'privacy_consent_at', 'privacy_consent_version', 'ui_preferences',
];
const COMPANY_SELF_SERVICE = [
  'contact_email', 'currency', 'name', 'open_days', 'open_hours', 'sector', 'size_band', 'timezone',
];

describe('088 security hardening', () => {
  it('lets a non-staff caller change exactly these profile columns', () => {
    expect(allowList('profiles_guard_privileged')).toEqual(PROFILE_SELF_SERVICE);
  });

  it('lets a non-staff caller change exactly these company columns', () => {
    expect(allowList('companies_guard_commercial')).toEqual(COMPANY_SELF_SERVICE);
  });

  it('compares every other column, not a named few', () => {
    expect(body('companies_guard_commercial')).toMatch(/jsonb_each\(to_jsonb\(NEW\) - self_service\)/);
    expect(body('profiles_guard_privileged')).toMatch(/jsonb_each\(to_jsonb\(NEW\) - allowed\)/);
    for (const fn of ['profiles_guard_privileged', 'companies_guard_commercial']) {
      expect(body(fn)).toMatch(/IS DISTINCT FROM \(to_jsonb\(OLD\) -> n\.key\)/);
    }
  });

  it("allows the self-service columns on your OWN profile only — nothing on a colleague's (093)", () => {
    expect(body('profiles_guard_privileged')).toMatch(
      /allowed := CASE WHEN OLD\.id = \(SELECT auth\.uid\(\)\) THEN self_service ELSE ARRAY\[\]::text\[\] END;/,
    );
  });

  it('refuses every non-staff INSERT and DELETE of a profile', () => {
    const b = body('profiles_guard_privileged');
    expect(b).toMatch(/TG_OP = 'INSERT' THEN\s+RAISE EXCEPTION/);
    expect(b).toMatch(/TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.profiles/);
  });

  it('keys the bypass on the PostgREST role, not on auth.uid() being null', () => {
    // auth.uid() is NULL for anon AND the service role, so a guard keyed
    // on it would wave anon through. current_user only works if the
    // functions stay SECURITY INVOKER.
    for (const fn of ['profiles_guard_privileged', 'companies_guard_commercial']) {
      const b = body(fn);
      expect(b).toMatch(/current_user NOT IN \('authenticated', 'anon'\)/);
      expect(b).not.toMatch(/SECURITY DEFINER/);
      expect(b).not.toMatch(/auth\.uid\(\) IS NULL/);
    }
  });

  it('makes the account lookup callable by the service role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.auth_user_id_by_email\(text\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.auth_user_id_by_email\(text\) TO service_role;/);
  });
});

// ── every user-session write in the portal fits inside the allow-list ──

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Top-level keys of the object literal starting at `src[open]` === '{'. */
function objectKeys(src: string, open: number): string[] {
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const inner = src.slice(open + 1, i);
  const keys: string[] = [];
  let d = 0;
  let token = '';
  for (const ch of inner + ',') {
    if ('{[('.includes(ch)) d++;
    if ('}])'.includes(ch)) d--;
    if (ch === ',' && d === 0) {
      const k = token.trim().match(/^([A-Za-z_]\w*)\s*(?::|$)/);
      if (k) keys.push(k[1]);
      token = '';
    } else {
      token += ch;
    }
  }
  return keys;
}

/** Columns written by `.from('<table>').update({...})` in user-session code. */
function sessionWrites(src: string, table: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\.update\\(\\s*\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(...objectKeys(src, m.index + m[0].length - 1));
  return out;
}

// A file that holds the service role writes with it, and the guard does
// not apply to it; the route itself is then what decides who may write.
const usesServiceRole = (src: string) =>
  /SUPABASE_SERVICE_ROLE_KEY|createServiceSupabaseClient/.test(src);

describe('portal user-session writes stay inside the 088 allow-lists', () => {
  const files = walk(join(REPO, 'portal/src'));

  it('the scanner reads multi-line and nested update objects', () => {
    const src = `supabase.from('companies')
      .update({
        name:  form.name,
        open_hours: { mon: [9, 17] },
        timezone,
      })`;
    expect(sessionWrites(src, 'companies')).toEqual(['name', 'open_hours', 'timezone']);
  });

  // Judged against the lists in the MIGRATION, not the copies above, so
  // narrowing the SQL alone is caught here too.
  it.each([
    ['profiles',  'profiles_guard_privileged'],
    ['companies', 'companies_guard_commercial'],
  ])('%s', (table, fn) => {
    const allowed = allowList(fn);
    const seen: string[] = [];
    const refused: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (usesServiceRole(src)) continue;
      for (const col of sessionWrites(src, table)) {
        seen.push(col);
        if (!allowed.includes(col)) refused.push(`${file.slice(REPO.length + 1)}: ${col}`);
      }
    }
    // The scan must actually be finding the known writers, or it proves nothing.
    expect(seen.length).toBeGreaterThan(0);
    expect(refused, 'the 088 guard would refuse these writes with 42501').toEqual([]);
  });
});
