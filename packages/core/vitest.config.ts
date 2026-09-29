import { defineConfig } from 'vitest/config';

export default defineConfig({
  // First test migrates the PGlite template database, which can take a while under parallel load.
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
