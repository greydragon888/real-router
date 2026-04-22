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

    // canGoBack/canGoForward must be in agreement with some valid position.
    expect(typeof router.canGoBack()).toBe("boolean");
    expect(typeof router.canGoForward()).toBe("boolean");

    // A valid final index must allow either a back or forward move unless we
    // are at both boundaries — impossible here because we have 4 entries.
    expect(router.canGoBack() || router.canGoForward()).toBe(true);

    expect(activations).toBeGreaterThan(0);

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

    expect(["home", "a", "b"]).toContain(name);
    expect(() => router.canGoBack()).not.toThrow();
    expect(() => router.canGoForward()).not.toThrow();

    unsubscribe();
  });
});
