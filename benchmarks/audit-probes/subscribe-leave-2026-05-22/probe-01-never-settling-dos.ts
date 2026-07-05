/**
 * Probe 01: never-settling Promise DoS.
 *
 * Hypothesis: subscribeLeave returns a Promise<void>; awaitLeaveListeners awaits
 * Promise.allSettled. If a listener returns a Promise that never settles
 * (`new Promise(() => {})`), navigation pipeline hangs indefinitely.
 *
 * No timeout in awaitLeaveListeners → DoS vector.
 *
 * Outcome:
 *   - timeout fires → BUG CONFIRMED: pipeline hangs, no internal timeout
 *   - navigate resolves → bug REFUTED (some safety net somewhere)
 */

import { createRouter } from "@real-router/core";

async function main() {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "target", path: "/target" },
  ]);
  await router.start("/");

  console.log("Initial state:", router.getState()?.name);

  router.subscribeLeave(() => new Promise<void>(() => {}));

  const timeoutMs = 1500;
  const navigatePromise = router.navigate("target");

  const winner = await Promise.race([
    navigatePromise.then(() => "navigate-resolved" as const),
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs),
    ),
  ]);

  console.log("Result:", winner);
  console.log("State after timeout:", router.getState()?.name);

  if (winner === "timeout") {
    console.log("\n→ Bug CONFIRMED: navigate hung for", timeoutMs, "ms.");
    console.log("  awaitLeaveListeners has no timeout — DoS vector exists.");
    process.exit(1);
  } else {
    console.log("\n→ Bug REFUTED: navigate resolved within timeout.");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});
