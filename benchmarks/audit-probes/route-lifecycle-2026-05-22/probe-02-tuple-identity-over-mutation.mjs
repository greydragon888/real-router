// Probe-02: getFunctions() preserves tuple ref across mutations (addCanActivate,
// clearCanActivate, clearAll, clearDefinitionGuards). CORRECTNESS invariant —
// not perf. Hot-path consumer (NavigationNamespace.#executeNavigation:296)
// would cache `const [d, a] = getFunctions()` once if the tuple identity
// changed across mutations, but reality is the tuple is read every navigate.
// What matters: the INNER Map refs must also stay the same — `clearAll` must
// mutate in place, not replace the Maps.

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "admin", path: "/admin" },
]);
await router.start("/");

const ns = getInternals(router).routeGetStore().lifecycleNamespace;
const lifecycle = getLifecycleApi(router);

const t0 = ns.getFunctions();
const d0 = t0[0];
const a0 = t0[1];

// Mutation 1: addCanActivate (external)
lifecycle.addActivateGuard("admin", () => () => true);
const t1 = ns.getFunctions();
const tupleStable1 = t1 === t0;
const mapStableD1 = t1[0] === d0;
const mapStableA1 = t1[1] === a0;
const activeNowHasAdmin = t1[1].has("admin");

console.log("[Probe-02a] After addActivateGuard:");
console.log("  tuple ref stable:", tupleStable1);
console.log("  deactivate Map ref stable:", mapStableD1);
console.log("  activate Map ref stable:", mapStableA1);
console.log("  Map contents updated (admin present):", activeNowHasAdmin);

// Mutation 2: addCanDeactivate (external)
lifecycle.addDeactivateGuard("admin", () => () => true);
const t2 = ns.getFunctions();
const tupleStable2 = t2 === t0;
const deactiveNowHasAdmin = t2[0].has("admin");

console.log("[Probe-02b] After addDeactivateGuard:");
console.log("  tuple ref stable:", tupleStable2);
console.log("  deactivate Map contents updated (admin present):", deactiveNowHasAdmin);

// Mutation 3: clearCanActivate
lifecycle.removeActivateGuard("admin");
const t3 = ns.getFunctions();
const tupleStable3 = t3 === t0;
const mapStableA3 = t3[1] === a0;
const adminGone = !t3[1].has("admin");

console.log("[Probe-02c] After removeActivateGuard:");
console.log("  tuple ref stable:", tupleStable3);
console.log("  activate Map ref stable:", mapStableA3);
console.log("  Map contents updated (admin gone):", adminGone);

// Mutation 4: clearAll via routes.clear (router.dispose is too aggressive)
// Use direct ns.clearAll for surgical probe.
ns.clearAll();
const t4 = ns.getFunctions();
const tupleStable4 = t4 === t0;
const mapStableD4 = t4[0] === d0;
const mapStableA4 = t4[1] === a0;
const sizeZero = t4[0].size === 0 && t4[1].size === 0;

console.log("[Probe-02d] After clearAll:");
console.log("  tuple ref stable:", tupleStable4);
console.log("  deactivate Map ref stable:", mapStableD4);
console.log("  activate Map ref stable:", mapStableA4);
console.log("  Maps cleared:", sizeZero);

const ok =
  tupleStable1 &&
  mapStableD1 &&
  mapStableA1 &&
  tupleStable2 &&
  tupleStable3 &&
  mapStableA3 &&
  tupleStable4 &&
  mapStableD4 &&
  mapStableA4 &&
  sizeZero;

if (ok) {
  console.log("\n→ VERIFIED: TUPLE_IDENTITY_PRESERVED_OVER_MUTATIONS invariant holds.");
  process.exitCode = 0;
} else {
  console.log("\n→ BUG: tuple identity broken on some mutation.");
  process.exitCode = 1;
}
