import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { Router } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "user", path: "/users/:id" },
  { name: "settings", path: "/settings" },
];

function waitForTransition(router: Router, action: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const unsub = router.subscribe(() => {
      unsub();
      resolve();
    });

    action();
  });
}

async function waitForHistoryNavigation(
  router: Router,
  action: () => void,
): Promise<void> {
  await waitForTransition(router, action);
}

function settle(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}

describe("Memory plugin", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  describe("Factory validation", () => {
    it("should throw TypeError for negative maxHistoryLength", () => {
      expect(() => memoryPluginFactory({ maxHistoryLength: -1 })).toThrow(
        TypeError,
      );
    });

    it("should throw TypeError for non-number maxHistoryLength", () => {
      expect(() =>
        memoryPluginFactory({ maxHistoryLength: "10" as unknown as number }),
      ).toThrow(TypeError);
    });

    it("should throw TypeError for NaN maxHistoryLength", () => {
      expect(() =>
        memoryPluginFactory({ maxHistoryLength: Number.NaN }),
      ).toThrow(TypeError);
    });

    it("should throw TypeError for Infinity maxHistoryLength", () => {
      expect(() =>
        memoryPluginFactory({ maxHistoryLength: Number.POSITIVE_INFINITY }),
      ).toThrow(TypeError);
    });

    it("should throw TypeError for fractional maxHistoryLength", () => {
      expect(() => memoryPluginFactory({ maxHistoryLength: 0.5 })).toThrow(
        TypeError,
      );
    });

    it("should not limit history when maxHistoryLength is zero", async () => {
      router.usePlugin(memoryPluginFactory({ maxHistoryLength: 0 }));
      await router.start("/");

      await router.navigate("users");
      await router.navigate("settings");

      expect(router.canGoBack()).toBe(true);
    });
  });

  it("should add back/forward/go/canGoBack/canGoForward to router", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    // Smoke test via actual invocation — TS contract already guarantees types.
    expect(() => {
      router.back();
    }).not.toThrow();
    expect(() => {
      router.forward();
    }).not.toThrow();
    expect(() => {
      router.go(0);
    }).not.toThrow();
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(false);
  });

  it("should navigate back through history", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("settings");

    expect(router.getState()?.name).toBe("settings");
    expect(router.canGoBack()).toBe(true);

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("users");
    expect(router.canGoBack()).toBe(true);
    expect(router.canGoForward()).toBe(true);
  });

  it("should navigate forward through history", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("settings");

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("users");
    expect(router.canGoForward()).toBe(true);

    await waitForHistoryNavigation(router, () => {
      router.forward();
    });

    expect(router.getState()?.name).toBe("settings");
    expect(router.canGoForward()).toBe(false);
  });

  it("should go(delta) by arbitrary offset", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("settings");

    expect(router.getState()?.name).toBe("settings");

    await waitForHistoryNavigation(router, () => {
      router.go(-2);
    });

    expect(router.getState()?.name).toBe("home");
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(true);
  });

  it("should no-op when go() exceeds history bounds", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");

    expect(router.getState()?.name).toBe("users");

    router.go(-5);

    expect(router.getState()?.name).toBe("users");

    router.go(5);

    expect(router.getState()?.name).toBe("users");
  });

  it("should respect maxHistoryLength", async () => {
    router.usePlugin(memoryPluginFactory({ maxHistoryLength: 3 }));
    await router.start("/");

    await router.navigate("users");
    await router.navigate("user", { id: "1" });
    await router.navigate("settings");
    await router.navigate("home");

    expect(router.getState()?.name).toBe("home");
    expect(router.canGoBack()).toBe(true);

    await waitForHistoryNavigation(router, () => {
      router.go(-2);
    });

    expect(router.getState()?.name).toBe("user");
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(true);
  });

  it("should handle replace option (no new history entry)", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("settings", {}, { replace: true });

    expect(router.getState()?.name).toBe("settings");

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("home");
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(true);
  });

  it("should clean up extensions on teardown", async () => {
    const unsubscribe = router.usePlugin(memoryPluginFactory());

    await router.start("/");

    await router.navigate("users");

    expect(router.canGoBack()).toBe(true);

    unsubscribe();

    expect(router).not.toHaveProperty("back");
    expect(router).not.toHaveProperty("forward");
    expect(router).not.toHaveProperty("go");
    expect(router).not.toHaveProperty("canGoBack");
    expect(router).not.toHaveProperty("canGoForward");
  });

  it("should clear history on stop", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("settings");

    expect(router.canGoBack()).toBe(true);

    router.stop();

    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(false);
  });

  it("should work with guards (navigate + guard does not add entry)", async () => {
    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
        { name: "user", path: "/users/:id" },
        {
          name: "settings",
          path: "/settings",
          canActivate: () => () => false,
        },
      ],
      { defaultRoute: "home" },
    );

    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");

    await expect(router.navigate("settings")).rejects.toMatchObject({
      code: "CANNOT_ACTIVATE",
    });

    expect(router.getState()?.name).toBe("users");
    expect(router.canGoForward()).toBe(false);

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("home");
  });

  it("should not desync index when guard blocks back()", async () => {
    let blockUsers = false;

    router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users",
          canActivate: () => () => !blockUsers,
        },
        { name: "settings", path: "/settings" },
      ],
      { defaultRoute: "home" },
    );

    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("settings");

    // History: [home, users, settings], index=2
    blockUsers = true;

    // back() tries to navigate to "users" → guard blocks
    router.back();
    await settle();

    // State should remain "settings", index should NOT have changed
    expect(router.getState()?.name).toBe("settings");
    expect(router.canGoBack()).toBe(true);
    expect(router.canGoForward()).toBe(false);

    // Unblock and verify back() works again
    blockUsers = false;

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("users");
    expect(router.canGoBack()).toBe(true);
    expect(router.canGoForward()).toBe(true);
  });

  it("should handle concurrent back() calls", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("user", { id: "1" });
    await router.navigate("settings");

    // History: [home, users, user, settings], index=3
    // Optimistic: first back() moves index 3→2, second 2→1

    router.back();
    router.back();
    await settle();

    const state = router.getState();

    expect(state?.name).toBe("users");
    expect(router.canGoBack()).toBe(true);
    expect(router.canGoForward()).toBe(true);
  });

  it("should not revert index when a newer navigation supersedes a blocked one", async () => {
    let blockUsers = false;

    router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users",
          canActivate: () => () => !blockUsers,
        },
        { name: "settings", path: "/settings" },
      ],
      { defaultRoute: "home" },
    );

    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("settings");

    // History: [home, users, settings], index=2
    blockUsers = true;

    // First back() to "users" (guard blocks) — index optimistically 2→1
    // Second back() to "home" (succeeds) — index optimistically 1→0
    // First catch must NOT revert index because second superseded it
    router.back();
    router.back();
    await settle();

    expect(router.getState()?.name).toBe("home");
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(true);
  });

  it("should update index without navigating when back() targets same state", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("home");

    // History: [home, users, home], index=2
    // back() targets "users", forward back to "home" — same path as current

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("users");

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    // History: [home, users, home], index=0 — "home" same as entry at index=2
    expect(router.getState()?.name).toBe("home");
    expect(router.canGoBack()).toBe(false);

    // forward() twice: index 0→1 (users, different state), then 1→2 (home, same state as... wait no)
    // Let's test same-state: replace creates duplicate entries
    router.stop();

    router = createRouter(routes, { defaultRoute: "home" });
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("home", {}, { replace: true });

    // History: [home, home], index=1 — back() targets "home" = same path
    router.back();

    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(true);
    expect(router.getState()?.name).toBe("home");
  });

  describe("Edge cases", () => {
    it("should no-op for go(0)", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");

      const stateBefore = router.getState();
      const navigateSpy = vi.spyOn(router, "navigate");

      router.go(0);

      expect(router.getState()).toBe(stateBefore);
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(router.canGoBack()).toBe(true);
      expect(router.canGoForward()).toBe(false);
    });

    it.each([
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
      ["0.5", 0.5],
      ["-1.7", -1.7],
    ])("should no-op for go(%s) without throwing", async (_label, delta) => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");

      const stateBefore = router.getState();
      const navigateSpy = vi.spyOn(router, "navigate");

      expect(() => {
        router.go(delta);
      }).not.toThrow();

      expect(router.getState()).toBe(stateBefore);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it("should be idempotent on repeated teardown", async () => {
      const unsubscribe = router.usePlugin(memoryPluginFactory());

      await router.start("/");
      await router.navigate("users");

      expect(() => {
        unsubscribe();
        unsubscribe();
      }).not.toThrow();
    });

    it("should truncate forward history when navigating after back()", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");
      await router.navigate("settings");

      // History: [home, users, settings], index=2

      await waitForHistoryNavigation(router, () => {
        router.back();
      });

      // At users, index=1
      expect(router.getState()?.name).toBe("users");
      expect(router.canGoForward()).toBe(true);

      await router.navigate("user", { id: "1" });

      // History: [home, users, user], index=2 — settings truncated
      expect(router.getState()?.name).toBe("user");
      expect(router.canGoForward()).toBe(false);
      expect(router.canGoBack()).toBe(true);

      await waitForHistoryNavigation(router, () => {
        router.back();
      });

      expect(router.getState()?.name).toBe("users");
    });

    it("should handle replace as first navigation after start", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users", {}, { replace: true });

      // "home" replaced with "users": [users], index=0
      expect(router.getState()?.name).toBe("users");
      expect(router.canGoBack()).toBe(false);
      expect(router.canGoForward()).toBe(false);
    });

    it("should no-op for back() on empty history after stop()", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");

      router.stop();

      // History cleared, index=-1
      router.back();
      router.forward();
      router.go(-1);
      router.go(1);

      expect(router.canGoBack()).toBe(false);
      expect(router.canGoForward()).toBe(false);
    });

    it("should be idempotent for multiple stop() calls", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");

      router.stop();
      router.stop();

      expect(router.canGoBack()).toBe(false);
      expect(router.canGoForward()).toBe(false);
    });

    it("should treat go(1) the same as forward()", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");
      await router.navigate("settings");

      await waitForHistoryNavigation(router, () => {
        router.go(-2);
      });

      expect(router.getState()?.name).toBe("home");

      await waitForHistoryNavigation(router, () => {
        router.go(1);
      });

      expect(router.getState()?.name).toBe("users");
    });

    it("should treat go(-1) the same as back()", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");
      await router.navigate("settings");

      await waitForHistoryNavigation(router, () => {
        router.go(-1);
      });

      expect(router.getState()?.name).toBe("users");
      expect(router.canGoBack()).toBe(true);
      expect(router.canGoForward()).toBe(true);
    });
  });

  describe("state.context.memory", () => {
    beforeEach(async () => {
      router.usePlugin(memoryPluginFactory());
    });

    it('direction is "navigate" for programmatic navigation', async () => {
      await router.start("/");

      const state = await router.navigate("users");

      expect(state.context.memory).toStrictEqual({
        direction: "navigate",
        historyIndex: 1,
      });
    });

    it('direction is "navigate" and historyIndex 0 on start', async () => {
      const state = await router.start("/");

      expect(state.context.memory).toStrictEqual({
        direction: "navigate",
        historyIndex: 0,
      });
    });

    it('direction is "back" after back()', async () => {
      await router.start("/");
      await router.navigate("users");

      await waitForTransition(router, () => {
        router.back();
      });

      const state = router.getState()!;

      expect(state.context.memory?.direction).toBe("back");
      expect(state.context.memory?.historyIndex).toBe(0);
    });

    it('direction is "forward" after forward()', async () => {
      await router.start("/");
      await router.navigate("users");

      await waitForTransition(router, () => {
        router.back();
      });

      await waitForTransition(router, () => {
        router.forward();
      });

      const state = router.getState()!;

      expect(state.context.memory?.direction).toBe("forward");
      expect(state.context.memory?.historyIndex).toBe(1);
    });

    it("context.memory is frozen", async () => {
      const state = await router.start("/");

      expect(Object.isFrozen(state.context.memory)).toBe(true);
    });

    it("is available in subscribe callback", async () => {
      await router.start("/");

      let contextMemory: unknown;

      router.subscribe(({ route }) => {
        contextMemory = route.context.memory;
      });

      await router.navigate("users");

      expect(contextMemory).toStrictEqual({
        direction: "navigate",
        historyIndex: 1,
      });
    });
  });
});
