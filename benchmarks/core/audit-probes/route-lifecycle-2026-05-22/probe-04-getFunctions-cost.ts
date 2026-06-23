// Probe-04: getFunctions() hot-path cost. CLAUDE.md Performance Notes
// (line 449-450) claims "cached tuple — no alloc per navigate". Verify by
// micro-measure: 10M calls, target ≤ 1ns per call (effectively V8 inlined
// property read). AC power, thermal nominal.

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "admin", path: "/admin" },
    { name: "users", path: "/users" },
  ]);
  await router.start("/");

  const lifecycle = getLifecycleApi(router);
  for (let i = 0; i < 50; i++) {
    lifecycle.addActivateGuard(`r${i}`, () => () => true);
  }

  const ns = getInternals(router).routeGetStore().lifecycleNamespace!;

  // Warmup
  let sink = 0;
  for (let i = 0; i < 100_000; i++) {
    const t = ns.getFunctions();
    sink += t[0].size + t[1].size;
  }

  const N = 10_000_000;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const t = ns.getFunctions();
    sink += t[0].size + t[1].size;
  }
  const t1 = process.hrtime.bigint();
  const total = Number(t1 - t0);
  const perCall = total / N;
  console.log(`[Probe-04] getFunctions() × ${N.toLocaleString()}:`);
  console.log(`  total: ${(total / 1e6).toFixed(2)} ms`);
  console.log(`  per call: ${perCall.toFixed(2)} ns`);
  console.log(`  sink (anti-DCE): ${sink}`);

  if (perCall < 3) {
    console.log("→ VERIFIED: per-call cost ≤ 3ns (cached tuple, no alloc).");
    process.exitCode = 0;
  } else if (perCall < 20) {
    console.log("→ ATTENTION: per-call cost > 3ns but < 20ns (inlining slipped?).");
    process.exitCode = 0;
  } else {
    console.log("→ POTENTIAL BUG: per-call cost ≥ 20ns — tuple may be re-allocated.");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
