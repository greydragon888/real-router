// Probe-01: EventEmitter snapshot invariant verification — fast-path size=1.
//
// Confirms Bug #1 from subscribe-audit at the EventBus level:
//   - When set.size === 1, EventEmitter.#emitFast does NOT snapshot.
//   - If the lone listener invokes subscribe() reentrantly, the new listener
//     should NOT execute in the current emit cycle (snapshot semantics).
//
// Setup: pure standalone, exercise EventBusNamespace.subscribe via Router so
// that subscribe internally uses EventEmitter.

import { createRouter } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

const router = createRouter(routes);
await router.start("/");

// === Variant A: 1 initial listener, reentrant subscribe inside listener ===
{
  const calls = [];
  const unsub1 = router.subscribe(() => {
    calls.push("outer");
    if (calls.length === 1) {
      // Reentrant subscribe — should NOT be invoked this cycle if snapshot honored.
      router.subscribe(() => {
        calls.push("added-during");
      });
    }
  });

  await router.navigate("about");
  console.log("[A:size=1] calls:", JSON.stringify(calls));
  // EXPECTED (snapshot honored): ["outer"]
  // ACTUAL (Bug #1 fast-path): ["outer","added-during"]
  unsub1();
}

// === Variant B: 2 initial listeners, reentrant subscribe inside first ===
const router2 = createRouter(routes);
await router2.start("/");
{
  const calls = [];
  router2.subscribe(() => {
    calls.push("first");
    if (calls.length === 1) {
      router2.subscribe(() => {
        calls.push("added-during");
      });
    }
  });
  router2.subscribe(() => {
    calls.push("second");
  });

  await router2.navigate("about");
  console.log("[B:size=2] calls:", JSON.stringify(calls));
  // EXPECTED: ["first","second"]  (snapshot honored at size >= 2)
}

router.dispose();
router2.dispose();
