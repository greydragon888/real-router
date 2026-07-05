// Probe-01: getFunctions() returns SAME tuple ref on consecutive calls (no mutation).
//
// Contract (CLAUDE.md L449-450, Performance Notes): «`getFunctions()` cached tuple
// — RouteLifecycleNamespace returns pre-allocated [deactivate, activate] array
// (no alloc per navigate)».
//
// Invariant TUPLE_CACHE_IDENTITY: forall consecutive non-mutating reads,
// getFunctions() === getFunctions().

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const router = createRouter([{ name: "home", path: "/" }]);
await router.start("/");

const ns = getInternals(router).routeGetStore().lifecycleNamespace;

const t1 = ns.getFunctions();
const t2 = ns.getFunctions();
const t3 = ns.getFunctions();

const sameRef = t1 === t2 && t2 === t3;
const sameInnerD = t1[0] === t2[0] && t2[0] === t3[0];
const sameInnerA = t1[1] === t2[1] && t2[1] === t3[1];

console.log("[Probe-01] No-mutation tuple identity:");
console.log("  t1 === t2 === t3:", sameRef);
console.log("  deactivate Map ref stable:", sameInnerD);
console.log("  activate Map ref stable:", sameInnerA);

if (sameRef && sameInnerD && sameInnerA) {
  console.log("→ VERIFIED: tuple identity preserved on consecutive reads.");
  process.exitCode = 0;
} else {
  console.log("→ BUG: tuple identity NOT preserved between reads.");
  process.exitCode = 1;
}
