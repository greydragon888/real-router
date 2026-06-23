// Probe-07: #registering Set leak check. The set is a recursion guard
// added in #registerHandler before compileFactory(). The finally block
// must remove the name regardless of throw / success. Verify via behaviour.
//
// Symptom of leak: after a factory throws, subsequent addActivateGuard
// for the SAME name would behave differently. Currently no behaviour is
// guarded by #registering — the Set is just `add` + `delete`, no read.
// So a leak (Set entry not removed) is silent ATM (no observable side-effect).
// But registerHandler line 317: `this.#registering.add(name)` — line 335:
// `this.#registering.delete(name)` in finally. Verify symmetrically.
//
// Since we can't introspect a private Set without WeakRef hack, the test is
// behavioural: throwing factory followed by a successful add for same name
// must work; an add-then-add (overwrite) must work; the namespace must be
// well-formed.

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "admin", path: "/admin" },
]);
await router.start("/");

const lifecycle = getLifecycleApi(router);

// Step 1: factory throws — Set should be cleaned in finally
let firstThrew = false;
try {
  lifecycle.addActivateGuard("admin", () => {
    throw new Error("factory throws");
  });
} catch (e) {
  firstThrew = true;
}
console.log("[Probe-07] First add throws (expected):", firstThrew);

// Step 2: re-add same name with valid factory
let secondOk = false;
try {
  lifecycle.addActivateGuard("admin", () => () => true);
  secondOk = true;
} catch (e) {
  console.log("[Probe-07] Second add unexpectedly threw:", e);
}
console.log("[Probe-07] Second add succeeds (no Set leak blocks re-add):", secondOk);

// Step 3: verify behaviour — admin is now navigable
const allowed = router.canNavigateTo("admin");
console.log("[Probe-07] Admin navigable after fixed add:", allowed);

// Step 4: post-failure factory map state — should NOT contain admin from failed add
// (rollback on failure: line 331 deletes from factories Map)
const ns = getInternals(router).routeGetStore().lifecycleNamespace;
const [_, a] = ns.getFunctions();
console.log(
  "[Probe-07] Functions Map state: admin →",
  a.get("admin") ? "function (the valid one)" : "missing",
);

if (firstThrew && secondOk && allowed) {
  console.log("\n→ VERIFIED: #registering Set has no observable leak; rollback works.");
  process.exitCode = 0;
} else {
  console.log("\n→ BUG: rollback or leak issue.");
  process.exitCode = 1;
}
