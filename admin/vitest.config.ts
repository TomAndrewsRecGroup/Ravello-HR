// Vitest needed the `@/` alias before a route handler could be tested.
//
// Every test in this app was over a pure function in `src/lib`, which
// resolves by relative path. Nothing had ever imported a route, so the
// alias tsconfig gives the compiler had no counterpart here and the
// first attempt failed with "Failed to load url @/lib/manatalJobFields".
//
// That gap is not incidental. A route is where this codebase's defects
// actually live — a handler that reports success while doing nothing is
// the failure this repo keeps writing down — and it was the one shape
// the suite could not reach.

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
