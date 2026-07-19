// probe-07: per-clone heap footprint regression check (#966).
//
// Contract: CLAUDE.md "Per-clone footprint (#966)" — a clone retains ≈ the
// cost of a fresh createRouter(routes) of the same size (measured ~173 KB vs
// ~175 KB for 50 routes on 2026-06-25 code). Re-measured here because the
// clone path changed since (#995 cleanup, #1030-#1035 reentrancy model).
//
// Heap magnitude probe — N-series (1000 instances), deterministic enough on
// battery per the probe protocol's grey-zone rule.
//
// Run: NODE_OPTIONS='--expose-gc --conditions=@real-router/internal-source' npx tsx <file>
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

import type { Route } from "@real-router/core";

const N = 1000;
const routes: Route[] = Array.from({ length: 50 }, (_, i) => ({
  name: `route${i}`,
  path: `/route${i}/:id`,
  defaultParams: { id: "1" },
}));

function fmtKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

void (async () => {
  if (typeof globalThis.gc !== "function") {
    console.log("SKIPPED: run with --expose-gc");

    return;
  }

  const base = createRouter(routes);

  await base.start("/route0/1");

  // --- clone series ---
  globalThis.gc();
  const beforeClones = process.memoryUsage().heapUsed;
  const clones: unknown[] = [];

  for (let i = 0; i < N; i++) {
    clones.push(cloneRouter(base));
  }

  globalThis.gc();
  const perClone = (process.memoryUsage().heapUsed - beforeClones) / N;

  // --- fresh createRouter series (reference per #966) ---
  globalThis.gc();
  const beforeFresh = process.memoryUsage().heapUsed;
  const freshRouters: unknown[] = [];

  for (let i = 0; i < N; i++) {
    freshRouters.push(createRouter(routes));
  }

  globalThis.gc();
  const perFresh = (process.memoryUsage().heapUsed - beforeFresh) / N;

  console.log(`per-clone heap (50 routes, N=${N}):  ${fmtKB(perClone)}`);
  console.log(`per-createRouter heap (reference):   ${fmtKB(perFresh)}`);

  const ratio = perClone / perFresh;

  console.log(`clone / fresh ratio: ${ratio.toFixed(2)}`);
  console.log(
    `verdict (#966 regression): ${ratio < 1.5 ? "OK — clone ≈ fresh createRouter" : "REGRESSION — clone costs >1.5× a fresh router"}`,
  );

  // keep references alive so GC can't reclaim mid-measurement
  console.log(`(refs: ${clones.length + freshRouters.length})`);
})();
