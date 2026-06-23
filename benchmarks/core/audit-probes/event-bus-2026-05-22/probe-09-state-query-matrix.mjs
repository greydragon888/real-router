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

// We approximate via a path-matcher that throws — leaves FSM in STARTING.
{
  const router = createRouter(routes);
  // Attempt to capture state mid-STARTING via an interceptor that observes.
  // (Cannot easily install one without using internal API.)
  console.log("[STARTING — observed via failed start]");
  try {
    await router.start("/nonexistent");
  } catch (e) {
    // doesn't matter
  }
  // Now should still be in STARTING if start failed before completeStart
  // (per start audit Bug #1). Or — IDLE per recover branch.
  console.log("  post-failed-start isActive:", router.isActive());
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
