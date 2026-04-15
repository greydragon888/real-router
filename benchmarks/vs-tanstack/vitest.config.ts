import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Shared vitest bench config. Override `test.benchmark.include` per-runner. */
export function createBenchConfig(include: string[]) {
  return defineConfig({
    plugins: [react()],
    test: {
      setupFiles: ["./vitest.setup.ts"],
      environment: "node", // JSDOM via manual setup, not vitest environment
      benchmark: {
        include,
      },
    },
  });
}

/** Default: runs ALL benchmarks (both real-router and tanstack). */
export default createBenchConfig(["**/*.bench.ts"]);
