import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts"],
      exclude: ["packages/core/src/index.ts", "packages/core/src/**/types.ts"],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
      reporter: ["text", "lcov"],
    },
  },
});
