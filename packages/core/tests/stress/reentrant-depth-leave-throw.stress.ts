// #1179 — the ONE load-bearing dispatch-depth `finally` under load.
//
// `#dispatchDepth` is restored in a `finally` around six sites: the 5 emitTransition*
// wrappers AND the synchronous subscribeLeave batch. For the 5 emit wrappers the
// `finally` is DEFENSIVE — the EventEmitter isolates listener throws, so the emit
// body never throws (event-depth-stress already hammers 1000 throwing SUCCESS
// listeners and stays green regardless of that `finally`).
//
// The sync subscribeLeave dispatch is the ONE case that actually load-bears it: a
// sync leave throw is caught into `firstSyncError` and RE-THROWN *after* the
// `finally` (EventBusNamespace `#dispatchDepth--` at the leave dispatch → `throw
// ensureError(firstSyncError)`). Drop that `finally` decrement and the throw leaks
// the increment — depth stays > 0, and every subsequent top-level navigate() is
// permanently, falsely rejected with REENTRANT_NAVIGATION. Functionally covered
// 1-shot (leave-approve-integration); this pins it across N navigations.
//
// Discriminating power (mutation-proven, #1179): remove the sync-leave `finally`
// decrement and this fails on iteration 1 — after the first throwing-leave
// navigation, the depth check below throws REENTRANT_NAVIGATION synchronously.

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

import type { Route, Router } from "@real-router/core";

const ROUTES: Route[] = [
  { name: "home", path: "/home" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

const N = 1000;

describe("#1179 throwing sync subscribeLeave under load never leaks dispatch depth", () => {
  it(`survives ${N} throwing-leave navigations — depth stays restored`, async () => {
    const router: Router = createRouter(ROUTES, { defaultRoute: "home" });

    await router.start("/home");

    for (let i = 0; i < N; i++) {
      // A sync leave throw rejects the navigation; the depth increment around the
      // sync leave batch must be restored by its `finally` before the re-throw.
      const unsub = router.subscribeLeave(() => {
        throw new Error("leave boom");
      });

      await router.navigate(i % 2 === 0 ? "a" : "b").catch(() => {
        /* expected: the sync leave throw rejects this navigation */
      });
      unsub();

      // Depth must be back to 0: a TOP-LEVEL navigate() must NOT throw
      // REENTRANT_NAVIGATION synchronously (the ban throws at the facade, before
      // returning the promise). A leaked increment throws here. We assert only on
      // the SYNCHRONOUS behavior — the async settle (SAME_STATES / success) is
      // irrelevant, so swallow it with `.catch()` inside the callback.
      expect(() => {
        void router.navigate("home").catch(() => {});
      }).not.toThrow();
    }

    // The router is still healthy after the load — a real navigation commits.
    await expect(router.navigate("a")).resolves.toBeDefined();

    router.dispose();
  });
});
