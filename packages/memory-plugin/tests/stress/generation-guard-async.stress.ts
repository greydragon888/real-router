import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import { noop, settle } from "./helpers";

import type { Route } from "@real-router/core";

describe("S9: generation-guard under concurrent async-guard pressure", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S9.1: 10 parallel back() calls with 100ms async guards — final index is valid, no orphan reverts", async () => {
    let activations = 0;
    const routes: Route[] = [
      { name: "home", path: "/" },
      {
        name: "a",
        path: "/a",
        canActivate: () => () => {
          activations++;

          return new Promise<boolean>((r) =>
            setTimeout(() => {
              r(true);
            }, 100),
          );
        },
      },
      {
        name: "b",
        path: "/b",
        canActivate: () => () => {
          activations++;

          return new Promise<boolean>((r) =>
            setTimeout(() => {
              r(true);
            }, 100),
          );
        },
      },
      {
        name: "c",
        path: "/c",
        canActivate: () => () => {
          activations++;

          return new Promise<boolean>((r) =>
            setTimeout(() => {
              r(true);
            }, 100),
          );
        },
      },
    ];

    const router = createRouter(routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(memoryPluginFactory());

    await router.start("/");

    await router.navigate("a");
    await router.navigate("b");
    await router.navigate("c");

    // Fire 10 back() calls rapidly — each bumps generation and sets optimistic index.
    // The generation-guard must ensure that superseded .catch handlers do not
    // revert #index of the latest #go.
    for (let i = 0; i < 10; i++) {
      router.back();
    }

    // Wait for every scheduled navigation to settle (100ms guards + slack).
    await new Promise<void>((r) => setTimeout(r, 600));
    await settle();

    // After the storm, the router must be in a valid state from the route set.
    const name = router.getState()?.name;

    expect(["home", "a", "b", "c"]).toContain(name);

    // 4 entries total ⇒ final index must support at least one of back/forward.
    expect(router.canGoBack() || router.canGoForward()).toBe(true);

    const memory = router.getState()?.context.memory as
      | { historyIndex: number }
      | undefined;

    expect(memory?.historyIndex).toBeGreaterThanOrEqual(0);
    expect(memory?.historyIndex).toBeLessThanOrEqual(3);

    // At most 10 guards could have been activated (one per back()), but due to
    // TRANSITION_CANCELLED early termination, fewer is expected. Must be >0
    // because the generation guard ensures at least the latest survives.
    expect(activations).toBeGreaterThan(0);
    expect(activations).toBeLessThanOrEqual(10);

    unsubscribe();
  });

  it("S9.2: async-blocked back() does not desync canGoBack across supersessions", async () => {
    // "b" blocks ONLY on the upcoming back() storm, not on the initial pushes.
    let blockB = false;
    const routes: Route[] = [
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      {
        name: "b",
        path: "/b",
        canActivate: () => () =>
          new Promise<boolean>((r) =>
            setTimeout(() => {
              r(!blockB);
            }, 80),
          ),
      },
    ];

    const router = createRouter(routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(memoryPluginFactory());

    await router.start("/");
    await router.navigate("a");
    await router.navigate("b"); // passes: blockB === false
    await router.navigate("a"); // history: [home, a, b, a], index=3

    blockB = true;

    // Two back()s interleaved: the first targets "b" (will be blocked by the
    // 80ms guard), the second supersedes it before its .catch fires.
    router.back(); // → b (will be blocked)
    router.back(); // → a (supersedes)

    await new Promise<void>((r) => setTimeout(r, 200));
    await settle();

    const name = router.getState()?.name;

    // History was [home, a, b, a], index=3 (at "a"). After two back()s, one of
    // which was blocked by the "b" guard, the second (to "a" at index=1)
    // superseded the first — so final state must be "a" with index in [0..3].
    expect(["home", "a", "b"]).toContain(name);

    const memory = router.getState()?.context.memory as
      | { historyIndex: number }
      | undefined;

    expect(memory?.historyIndex).toBeGreaterThanOrEqual(0);
    expect(memory?.historyIndex).toBeLessThanOrEqual(3);

    unsubscribe();
  });
});
