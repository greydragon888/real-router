/**
 * Probe 01: VERIFY — Dependencies shallow merge leak.
 *
 * Hypothesis: cloneRouter uses `{...sourceDeps, ...dependencies}` shallow merge
 * (cloneRouter.ts:39-42). If sourceDeps contains a mutable object reference
 * (Map, Set, instance), the clone shares the SAME reference. Mutation in clone
 * mutates original (cross-clone data leak).
 *
 * Security implication: SSR-multi-tenant uses cloneRouter to create per-request
 * routers from a base router. If base.dependencies contains a cache/db/user
 * object — mutations in one request affect all other requests.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";

interface Deps {
  sharedMap: Map<string, string>;
  sharedSet: Set<number>;
  primitive: string;
  nested: { count: number };
}

async function main(): Promise<void> {
  const sharedMap = new Map<string, string>([["initial", "from-base"]]);
  const sharedSet = new Set<number>([1, 2, 3]);
  const sharedNested = { count: 10 };

  const base = createRouter<Deps>(
    [{ name: "home", path: "/" }],
    {},
    {
      sharedMap,
      sharedSet,
      primitive: "base-primitive",
      nested: sharedNested,
    },
  );

  const clone = cloneRouter(base);
  const baseDeps = getDependenciesApi(base);
  const cloneDeps = getDependenciesApi(clone);

  // 1) Identity check: are the mutable refs the SAME object?
  const baseMap = baseDeps.get("sharedMap") as Map<string, string>;
  const cloneMap = cloneDeps.get("sharedMap") as Map<string, string>;

  console.log("--- Identity check ---");
  console.log("baseMap === cloneMap (shared ref):", baseMap === cloneMap);
  console.log("baseSet === cloneSet:",
    (baseDeps.get("sharedSet") as Set<number>) === (cloneDeps.get("sharedSet") as Set<number>));
  console.log("baseNested === cloneNested:",
    (baseDeps.get("nested") as object) === (cloneDeps.get("nested") as object));

  // 2) Mutation in clone → does it leak to base?
  cloneMap.set("from-clone", "leaked-back");
  (cloneDeps.get("sharedSet") as Set<number>).add(999);
  (cloneDeps.get("nested") as { count: number }).count = 999;

  console.log("\n--- Cross-request leak check ---");
  console.log("base.sharedMap.has('from-clone'):", baseMap.has("from-clone"));
  console.log("base.sharedSet.has(999):", (baseDeps.get("sharedSet") as Set<number>).has(999));
  console.log("base.nested.count after clone mutation:", (baseDeps.get("nested") as { count: number }).count);

  // 3) Verdict
  const leakDetected =
    baseMap === cloneMap ||
    baseMap.has("from-clone") ||
    (baseDeps.get("nested") as { count: number }).count === 999;

  console.log("\n--- Verdict ---");

  if (leakDetected) {
    console.log("→ Bug CONFIRMED: cloneRouter shares mutable dependency refs with original.");
    console.log("  SSR-multi-tenant: cross-request mutation of base deps via clone.");
    process.exitCode = 1;
  } else {
    console.log("→ Bug REFUTED: deps are isolated.");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
