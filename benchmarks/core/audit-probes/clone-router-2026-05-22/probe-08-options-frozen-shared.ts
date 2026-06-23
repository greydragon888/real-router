/**
 * Probe 08: VERIFY — Options are cloned (per CLAUDE.md ~line 470 — frozen, but is it a fresh copy?).
 *
 * cloneRouter.ts:33: ctx.cloneOptions() — what does it do exactly?
 * Router.ts:259: cloneOptions: () => ({ ...this.#options.get() }) — shallow spread.
 * If options contain nested objects (e.g., `logger` config), shallow spread shares ref.
 *
 * What matters here: are nested option values shared?
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter(
    [{ name: "home", path: "/" }],
    {
      defaultRoute: "home",
      trailingSlash: "preserve",
      // queryParams is a nested object — let's test
      queryParams: { arrayFormat: "comma" },
    } as Parameters<typeof createRouter>[1],
  );

  const baseOpts = getPluginApi(base).getOptions();
  const clone = cloneRouter(base);
  const cloneOpts = getPluginApi(clone).getOptions();

  console.log("--- Identity check ---");
  console.log("baseOpts === cloneOpts (top-level):", baseOpts === cloneOpts);
  console.log("base.queryParams === clone.queryParams (nested):", baseOpts.queryParams === cloneOpts.queryParams);

  // Note: options are deeply frozen at construction → mutation impossible
  console.log("\n--- Frozen status ---");
  console.log("Object.isFrozen(baseOpts):", Object.isFrozen(baseOpts));
  console.log("Object.isFrozen(cloneOpts):", Object.isFrozen(cloneOpts));
  console.log("Object.isFrozen(base.queryParams):", Object.isFrozen(baseOpts.queryParams));
  console.log("Object.isFrozen(clone.queryParams):", Object.isFrozen(cloneOpts.queryParams));

  // Since both are frozen, sharing is SAFE from mutation. But are they:
  // - structurally equal? YES
  // - identical references? Top-level should differ (shallow spread); nested values share

  console.log("\n--- Verdict ---");

  if (baseOpts === cloneOpts) {
    console.log("→ Top-level options REFERENCE shared (suspicious).");
  } else if (baseOpts.queryParams === cloneOpts.queryParams) {
    console.log("→ Top-level cloned but nested objects SHARE refs (frozen → safe).");
    console.log("  Acceptable but document.");
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
