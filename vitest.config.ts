import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@bharat-stack/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts", "packages/render/src/**/*.ts"],
      exclude: [
        "packages/*/src/index.ts",
        "packages/*/src/**/types.ts",
        "packages/core/src/invoice/index.ts",
      ],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
      reporter: ["text", "lcov"],
    },
  },
});
