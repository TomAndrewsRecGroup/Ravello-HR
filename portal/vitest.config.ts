// Same `@/` alias the compiler gets from tsconfig. Until 2026-09-24 every
// portal test imported a pure function by relative path, so nothing here
// could load the middleware (which imports `@/lib/...`) — and the
// middleware is where the unreachable leave link and the unenforced
// module flags actually lived. Mirrors admin/vitest.config.ts.
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
