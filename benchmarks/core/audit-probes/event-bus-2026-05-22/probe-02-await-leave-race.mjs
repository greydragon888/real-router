// Probe-02: awaitLeaveListeners race with abort-signal (subscribe-leave Bug #1).
//
// Verify that Promise.allSettled in awaitLeaveListeners does NOT race with
// abort-signal — never-settling listener should hang router.navigate even when
// cancellation/abort is issued.

import { createRouter } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

const router = createRouter(routes);
await router.start("/");

router.subscribeLeave(() => new Promise(() => {})); // never settles

// Race: navigate ↔ 200ms timeout
const navPromise = router.navigate("a").then(
  (s) => `resolved:${s?.name}`,
  (e) => `rejected:${e?.code || e?.message}`,
);

const result = await Promise.race([
  navPromise,
  new Promise((resolve) => setTimeout(() => resolve("timeout-200ms"), 200)),
]);

console.log("[case A: never-settling] result:", result);

// Variant: concurrent navigate cancels first one — does it unblock?
const cancellingPromise = router.navigate("b").then(
  (s) => `resolved:${s?.name}`,
  (e) => `rejected:${e?.code || e?.message}`,
);

const result2 = await Promise.race([
  navPromise,
  cancellingPromise,
  new Promise((resolve) => setTimeout(() => resolve("timeout-200ms"), 200)),
]);

console.log("[case B: nav1 + concurrent nav2 (also blocked)] result:", result2);

router.dispose();

// Show overall outcome: navPromise still pending after dispose?
const tail = await Promise.race([
  navPromise.catch((e) => `nav1-rejected:${e?.code || e?.message}`),
  new Promise((resolve) => setTimeout(() => resolve("nav1-still-pending"), 100)),
]);
console.log("[case C: after dispose] nav1 outcome:", tail);
