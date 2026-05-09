import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
  },
  resolve: {
    extensions: [".ts", ".js", ".json"],
  },
});
