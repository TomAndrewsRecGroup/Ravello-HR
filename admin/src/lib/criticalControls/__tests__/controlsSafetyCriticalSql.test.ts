import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/205_controls_safety_critical.sql'), 'utf-8');

describe('migration 205: controls.safety_critical', () => {
  it('adds a boolean column, NOT NULL, defaulted false — never retroactively marking an existing control critical', () => {
    expect(sql).toMatch(/ALTER TABLE public\.controls ADD COLUMN IF NOT EXISTS safety_critical boolean NOT NULL DEFAULT false/);
  });
});
