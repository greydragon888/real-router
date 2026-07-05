/**
 * Probe 05: verify that start() rejections are mislabeled as "router.navigate"
 * in the unhandled-rejection logger.
 *
 * Router.start at line 430 calls Router.#suppressUnhandledRejection which
 * uses Router.#onSuppressedError which calls
 *   logger.error("router.navigate", "Unexpected navigation error", error)
 *
 * Bug: for a start() failure the category should be "router.start" or
 * similar, not "router.navigate". This pollutes logs and misroutes errors.
 *
 * Repro: install a real logger that captures category + message and force a
 * unexpected-class error through start() (not a RouterError code in the
 * suppression list, so it reaches the else branch and logs).
 */

import { logger } from "@real-router/logger";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const captured: Array<{ ctx: string; msg: string; err: unknown }> = [];

  logger.configure({
    error: (ctx: string, msg: string, err: unknown) => {
      captured.push({ ctx, msg, err });
    },
    warn: () => {},
    info: () => {},
  });

  const router = createRouter([{ name: "home", path: "/" }]);

  // Non-RouterError throw — not on the suppressed list, will be logged.
  getPluginApi(router).addInterceptor("start", async () => {
    throw new TypeError("custom error from start interceptor");
  });

  // Fire-and-forget the rejection
  void router.start("/").catch(() => {
    /* swallow */
  });

  await new Promise((r) => setTimeout(r, 50));

  if (captured.length === 0) {
    console.log("→ No log emitted — caller's .catch() suppressed it (correct).");
    console.log("  But fire-and-forget without external catch WOULD log via");
    console.log("  Router.#suppressUnhandledRejection — re-test with another path.");
  } else {
    console.log("Captured log entries:");
    for (const e of captured) {
      console.log(`  ctx="${e.ctx}" msg="${e.msg}"`);
    }
  }

  // Second attempt: void without external .catch, the .catch in
  // Router.start is the .catch on internals.start; the suppressor adds
  // .catch on promiseState. So we need a fresh router.
  const router2 = createRouter([{ name: "home", path: "/" }]);
  getPluginApi(router2).addInterceptor("start", () => {
    throw new TypeError("custom error from start interceptor #2");
  });

  void router2.start("/"); // fire-and-forget completely

  await new Promise((r) => setTimeout(r, 50));

  console.log("\nAfter void router2.start():");
  for (const e of captured) {
    console.log(`  ctx="${e.ctx}" msg="${e.msg}"`);
  }

  const hasNavigateCategory = captured.some(
    (e) => e.ctx === "router.navigate",
  );

  if (hasNavigateCategory) {
    console.log("\n→ Bug CONFIRMED: start() errors logged under 'router.navigate' category.");
    process.exitCode = 1;
  } else {
    console.log("\n→ No 'router.navigate' category — log category is correct.");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
