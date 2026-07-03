// Probe-09: 8x8 state-query matrix verification.
//
// For each FSM state, determine which state-query methods (isActive,
// isDisposed, isTransitioning, isLeaveApproved, isReady, canStart,
// canBeginTransition, canCancel) return true.
//
// All states inspected via real Router driven through public API.

import { createRouter } from "@real-router/core";
import { getNavigator } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const routes = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

// Helper: snapshot all queries we can reach from public surface
function snapshot(router) {
  return {
    isActive: router.isActive(),
    // Internal-only queries are not exposed on Router facade. Use Navigator:
    isLeaveApproved: router.isLeaveApproved?.(),
    // canStart, canBeginTransition, canCancel, isReady, isDisposed,
    // isTransitioning — internal, accessed via internals or by-product:
    // We can derive isDisposed/isTransitioning by behaviour (e.g.,
    // navigate throws ROUTER_DISPOSED, route operations refuse).
  };
}

// === IDLE: pre-start router ===
{
  const router = createRouter(routes);
  console.log("[IDLE before start]");
  console.log("  isActive:", router.isActive());
  console.log("  isLeaveApproved:", router.isLeaveApproved());
}

// === STARTING: not directly observable from JS — need to inject interceptor ===
// Use plugin onStart synchronous spy to capture state. Actually, sendStart()
// transitions to STARTING which transitions to READY in same microtask of
// completeStart. So STARTING is observable only by an interceptor running
// synchronously between sendStart and completeStart.

// HISTORICAL NOTE (refreshed 2026-07-03): the original comment expected the FSM
// to be "stuck in STARTING" per the pre-#670 start audit Bug #1 — that recovery
// landed long ago. More importantly, `start("/nonexistent")` is NOT a failure
// under the DEFAULT options: `allowNotFound` defaults to TRUE
// (OptionsNamespace/constants.ts), so this start RESOLVES to UNKNOWN_ROUTE and
// `isActive() === true` here is the CORRECT post-success value. The
// pre-commit-unwind contract (rejected ROUTE_NOT_FOUND → IDLE, isActive=false)
// only applies with `{ allowNotFound: false }` — verified 2026-07-03.
{
  const router = createRouter(routes);
  console.log("[not-found start — resolves to UNKNOWN_ROUTE under default allowNotFound:true]");
  try {
    await router.start("/nonexistent");
  } catch (e) {
    // unreachable under default options
  }
  console.log("  post-not-found-start isActive (true = committed UNKNOWN_ROUTE):", router.isActive());
}

// === READY ===
{
  const router = createRouter(routes);
  await router.start("/");
  console.log("[READY]");
  console.log("  isActive:", router.isActive());
  console.log("  isLeaveApproved:", router.isLeaveApproved());
}

// === TRANSITION_STARTED: inject async deactivate guard, observe mid-flight ===
{
  const router = createRouter(routes);
  await router.start("/");
  const lifecycle = getLifecycleApi(router);
  lifecycle.addDeactivateGuard("home", () => async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return true;
  });
  const p = router.navigate("a");
  await new Promise((resolve) => setTimeout(resolve, 5));
  console.log("[TRANSITION_STARTED]");
  console.log("  isActive:", router.isActive());
  console.log("  isLeaveApproved:", router.isLeaveApproved());
  await p;
}

// === LEAVE_APPROVED: inject leave-listener + async activate guard ===
{
  const router = createRouter(routes);
  await router.start("/");
  const lifecycle = getLifecycleApi(router);
  lifecycle.addActivateGuard("a", () => async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return true;
  });
  router.subscribeLeave(() => {});

  const p = router.navigate("a");
  await new Promise((resolve) => setTimeout(resolve, 5));
  console.log("[LEAVE_APPROVED]");
  console.log("  isActive:", router.isActive());
  console.log("  isLeaveApproved:", router.isLeaveApproved());
  await p;
}

// === DISPOSED ===
{
  const router = createRouter(routes);
  await router.start("/");
  router.dispose();
  console.log("[DISPOSED]");
  console.log("  isActive:", router.isActive());
  console.log("  isLeaveApproved:", router.isLeaveApproved());
}
