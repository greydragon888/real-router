// Probe-03: signal.reason propagation through #cleanupController.
//
// subscribe-leave audit Bug #14: when navigate succeeds, #cleanupController
// calls controller.abort() without a reason → signal.reason becomes default
// DOMException [AbortError] instead of an intentional value.

import { createRouter } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
];

// === Case 1: successful navigation, cleanupController.abort() with no reason ===
{
  const router = createRouter(routes);
  await router.start("/");

  let observed;
  router.subscribeLeave(async (payload) => {
    // Wait long enough that #finishAsyncNavigation finishes after we observe.
    const { signal } = payload;
    await new Promise((resolve) => setTimeout(resolve, 20));
    setTimeout(() => {
      observed = { aborted: signal.aborted, reason: String(signal.reason) };
    }, 30);
  });

  await router.navigate("a"); // succeeds
  await new Promise((resolve) => setTimeout(resolve, 80));
  console.log("[case 1: success] signal post-nav:", observed);

  router.dispose();
}

// === Case 2: concurrent navigation aborts the first one ===
{
  const router = createRouter(routes);
  await router.start("/");

  const observations = [];
  router.subscribeLeave(async (payload) => {
    const { signal } = payload;
    signal.addEventListener("abort", () => {
      observations.push({ aborted: signal.aborted, reason: String(signal.reason) });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  // First navigate triggers leave-listener, then second cancels it
  const p1 = router.navigate("a").catch((e) => ({ code: e?.code, message: e?.message }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const p2 = router.navigate("home").catch((e) => ({ code: e?.code, message: e?.message }));

  await Promise.all([p1, p2]);
  console.log("[case 2: concurrent-cancel] signal-abort observations:", observations);

  router.dispose();
}
