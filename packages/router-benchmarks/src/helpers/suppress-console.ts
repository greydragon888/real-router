// packages/router-benchmarks/modules/helpers/suppress-console.ts

/**
 * Suppress console output during benchmarks.
 * Must be imported FIRST before any other imports.
 */

console.log = () => {};
console.warn = () => {};
console.error = () => {};

const isRealRouter =
  process.env.BENCH_ROUTER === "real-router" || !process.env.BENCH_ROUTER;

if (isRealRouter) {
  void (async () => {
    const { logger } = await import("@real-router/logger");

    logger.configure({ level: "none" });
  })();
}
