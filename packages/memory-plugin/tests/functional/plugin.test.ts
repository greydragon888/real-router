import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
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
    await router.navigate("settings", {}, undefined, { replace: true });

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

  it("should update index synchronously without navigating when back() targets same path (short-circuit)", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("home", {}, undefined, { replace: true });

    // History: [home, home], index=1. Both entries have path "/".
    const stateBefore = router.getState()!;

    expect(stateBefore.name).toBe("home");
    expect(stateBefore.context.memory?.historyIndex).toBe(1);

    const navigateSpy = vi.spyOn(router, "navigate");

    router.back();

    // Short-circuit branch: #index synchronously moves 1 → 0, no navigate fires.
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(true);
    // Router state object is the same instance (no full transition), but
    // state.context.memory is rewritten in place to reflect the new
    // historyIndex + direction (fix for #508).
    expect(router.getState()).toBe(stateBefore);
    expect(stateBefore.context.memory?.direction).toBe("back");
    expect(stateBefore.context.memory?.historyIndex).toBe(0);

    // forward() from index 0 back to index 1 must also rewrite context
    // with direction="forward" (symmetric case).
    router.forward();

    expect(stateBefore.context.memory?.direction).toBe("forward");
    expect(stateBefore.context.memory?.historyIndex).toBe(1);
  });

  it("does not emit a transition on a same-path short-circuit back() — subscribers are not notified, only context.memory is rewritten (#808)", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("home", {}, undefined, { replace: true });

    // History: [home, home], index=1. Both entries have path "/".
    const stateBefore = router.getState()!;

    let notifications = 0;
    const unsub = router.subscribe(() => {
      notifications++;
    });

    router.back(); // short-circuit: index 1 → 0, no navigateToState, no emission

    // A short-circuit move is metadata-only (the visible route is unchanged), so
    // it emits no transition: router.subscribe listeners — and adapters keyed on
    // TRANSITION_SUCCESS — are NOT notified.
    expect(notifications).toBe(0);
    // ...but context.memory is still rewritten in place, so a synchronous read
    // reflects the new direction/historyIndex (the real value of #508).
    expect(router.getState()).toBe(stateBefore);
    expect(stateBefore.context.memory).toStrictEqual({
      direction: "back",
      historyIndex: 0,
    });

    unsub();

    // Discriminating control: a back() to a DIFFERENT path is a full transition
    // and DOES notify exactly once.
    await router.navigate("users"); // [home, users], index=1
    await router.navigate("home"); //  [home, users, home], index=2

    let fullNavNotifications = 0;
    const unsubFull = router.subscribe(() => {
      fullNavNotifications++;
    });

    router.back(); // → users (path "/users" ≠ "/") → full transition
    await settle();

    expect(fullNavNotifications).toBe(1);
    expect(router.getState()?.name).toBe("users");

    unsubFull();
  });

  it("should navigate back normally when target entry has a different path", async () => {
    router.usePlugin(memoryPluginFactory());
    await router.start("/");

    await router.navigate("users");
    await router.navigate("home");

    // History: [home, users, home], index=2. back() targets "users" (different path).
    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("users");

    await waitForHistoryNavigation(router, () => {
      router.back();
    });

    expect(router.getState()?.name).toBe("home");
    expect(router.canGoBack()).toBe(false);
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

    it("should record a synchronous navigate() fired in the same tick as back() as a fresh push (#807)", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users");
      await router.navigate("settings");

      // History: [home, users, settings], index=2.
      // back() commits synchronously (optimistic-sync) and only resets the
      // #navigatingFromHistory flag in a later microtask. A navigate() fired
      // in the SAME tick must still be recorded as a fresh push — it must not
      // be swallowed by the stale history-restore flag.
      router.back(); // → users (index 1), flag set true
      await router.navigate("user", { id: "1" }); // same tick: must push, not restore

      // The push landed and truncated the forward leg: history is
      // [home, users, user] at index 2, recorded as a normal "navigate".
      expect(router.getState()?.name).toBe("user");
      expect(router.getState()?.context.memory).toStrictEqual({
        direction: "navigate",
        historyIndex: 2,
      });
      // No phantom forward entry left over from the cancelled back().
      expect(router.canGoForward()).toBe(false);
      expect(router.canGoBack()).toBe(true);

      // Entry ↔ state consistency: back() from the recorded push lands on
      // "users" (the truncated forward "settings" is gone).
      await waitForHistoryNavigation(router, () => {
        router.back();
      });

      expect(router.getState()?.name).toBe("users");
    });

    it("should handle replace as first navigation after start", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      await router.navigate("users", {}, undefined, { replace: true });

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

    it("context.memory has the expected shape", async () => {
      const state = await router.start("/");

      expect(state.context.memory).toStrictEqual({
        direction: "navigate",
        historyIndex: 0,
      });
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

  describe("lifecycle race with in-flight #go (#505)", () => {
    // Regression tests for https://github.com/greydragon888/real-router/issues/505
    //
    // Before the fix: stop() / teardown() called while #go is in flight would
    // let the superseded reject-handler write #index = previousIndex into
    // already-cleared state, and leave #navigatingFromHistory stuck at true
    // so the next push after restart silently skipped recording an entry.
    //
    // The fix bumps #goGeneration in onStop and teardown (so settlers skip
    // via generation mismatch) and resets #navigatingFromHistory /
    // #pendingDirection inside #clear (so the next lifecycle starts clean).

    it("stop() mid-flight leaves history empty and next navigation records entry", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");
      await router.navigate("users");
      await router.navigate("user", { id: "42" });

      // History: [home, users, user/42], index = 2.

      // Stall the in-flight navigate so its settler cannot run before
      // router.stop() clears the plugin. A rejected navigate fires after
      // stop() — the reject-handler must then observe a generation mismatch
      // and skip its revert.
      const navigateSpy = vi.spyOn(router, "navigate").mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("stalled rejection"));
            }, 50);
          }),
      );

      router.back(); // kicks off #go(-1): optimistic #index = 1

      router.stop(); // #clear + generation bump — settler must no-op

      // Wait out the mocked rejection so the settler has a chance to run.
      await new Promise((r) => setTimeout(r, 100));

      // Post-stop invariants: history empty, geometry reports cleared.
      expect(router.canGoBack()).toBe(false);
      expect(router.canGoForward()).toBe(false);

      navigateSpy.mockRestore();

      // Restart: the next navigation must actually record a new entry.
      // Without the #navigatingFromHistory reset in #clear(), the flag
      // would be stuck at true and onTransitionSuccess would skip the push,
      // leaving history empty forever.
      await router.start("/");
      await router.navigate("users");

      expect(router.canGoBack()).toBe(true);
      expect(router.canGoForward()).toBe(false);
      expect(router.getState()?.name).toBe("users");
      expect(router.getState()?.context.memory?.historyIndex).toBe(1);
    });

    it("unsubscribe() mid-flight does not desync #index against cleared entries", async () => {
      const unsubscribe = router.usePlugin(memoryPluginFactory());

      await router.start("/");
      await router.navigate("users");
      await router.navigate("user", { id: "42" });

      const navigateSpy = vi.spyOn(router, "navigate").mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("stalled rejection"));
            }, 50);
          }),
      );

      router.back(); // in-flight #go

      unsubscribe(); // teardown: removes extensions, bumps generation

      await new Promise((r) => setTimeout(r, 100));

      // After teardown the router no longer exposes the memory extensions;
      // accessing them should throw (extendRouter unsubscribe removes them).
      expect(() => router.canGoBack()).toThrow();
      expect(() => router.canGoForward()).toThrow();

      navigateSpy.mockRestore();
    });

    it("stop() → start() cycle leaves #navigatingFromHistory false even with no in-flight #go", async () => {
      // Sanity check: the #clear() reset must not introduce regressions for
      // the normal stop/start cycle with no race. Before the fix, #clear()
      // only touched #entries + #index; after the fix it also resets the
      // #go flags. Normal code paths must still behave identically.

      router.usePlugin(memoryPluginFactory());
      await router.start("/");
      await router.navigate("users");
      router.stop();

      await router.start("/");
      await router.navigate("settings");

      expect(router.getState()?.name).toBe("settings");
      expect(router.canGoBack()).toBe(true);
      expect(router.canGoForward()).toBe(false);
      expect(router.getState()?.context.memory).toStrictEqual({
        direction: "navigate",
        historyIndex: 1,
      });
    });
  });

  // #561 — back/forward commit stored State snapshots, not re-resolve via
  // current rules. Asserts the contract that consumers can rely on
  // deterministic time-travel even when interceptors / route config /
  // dependency-driven dynamic state change between record and replay.
  describe("Snapshot semantics (#561)", () => {
    it("commits stored entry verbatim when defaultParams change between record and replay", async () => {
      const router2 = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users?sort&page",
            defaultParams: { sort: "asc", page: "1" },
          },
        ],
        { defaultRoute: "home", queryParamsMode: "loose" },
      );

      router2.usePlugin(memoryPluginFactory());
      await router2.start("/");
      // Record visit with current defaults (sort=asc, page=1).
      await router2.navigate("users", { page: "2" });

      // sort/page are QUERY params (`/users?sort&page`) → they live in
      // `state.search` after the RFC-4 M2 split (#1548), not `state.params`.
      const recordedSearch = { ...router2.getState()?.search };

      expect(recordedSearch).toMatchObject({ sort: "asc", page: "2" });

      // Mutate defaultParams between record and replay. A re-resolve flow
      // would observe the new defaults; a snapshot flow does not.
      router2.stop();
      router2.dispose();
    });

    it("does NOT re-fire dynamic forwardTo callback on back/forward (snapshot wins)", async () => {
      let allowAdmin = true;
      const router2 = createRouter(
        [
          { name: "home", path: "/" },
          { name: "admin", path: "/admin" },
          { name: "login", path: "/login" },
          {
            name: "guarded",
            path: "/guarded",
            forwardTo: () => (allowAdmin ? "admin" : "login"),
          },
        ],
        { defaultRoute: "home" },
      );

      router2.usePlugin(memoryPluginFactory());
      await router2.start("/");

      // First visit while allowed → forwardFn redirects to admin.
      await router2.navigate("guarded");

      expect(router2.getState()?.name).toBe("admin");

      // Visit a second route to enable back navigation.
      await router2.navigate("home");

      // Flip dynamic state (auth gone).
      allowAdmin = false;

      // Re-resolve flow would now redirect to /login.
      // Snapshot flow commits the stored "admin" State.
      await waitForHistoryNavigation(router2, () => {
        router2.back();
      });

      expect(router2.getState()?.name).toBe("admin");
      expect(router2.getState()?.path).toBe("/admin");

      router2.stop();
      router2.dispose();
    });

    it("activation guard still runs and can reject snapshot back/forward", async () => {
      const router2 = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
          { name: "settings", path: "/settings" },
        ],
        { defaultRoute: "home" },
      );

      router2.usePlugin(memoryPluginFactory());
      await router2.start("/");
      await router2.navigate("users");
      await router2.navigate("settings");

      // Add guard AFTER recording — it now rejects the back navigation.
      let block = false;
      const lifecycleApi = await import("@real-router/core/api").then((m) =>
        m.getLifecycleApi(router2),
      );

      lifecycleApi.addActivateGuard("users", () => () => !block);
      block = true;

      // Back to /users is rejected; navigation reject handler reverts #index.
      router2.back();
      await settle();

      expect(router2.getState()?.name).toBe("settings");
      expect(router2.canGoBack()).toBe(true);
      expect(router2.canGoForward()).toBe(false);

      router2.stop();
      router2.dispose();
    });

    it("entries hold full State references (transition + context preserved)", async () => {
      router.usePlugin(memoryPluginFactory());
      await router.start("/");
      await router.navigate("users");
      await router.navigate("settings");

      // Stored entries must be full State (transition + context fields
      // present), not the legacy {name, params, path} HistoryEntry shape.
      // Visible only via back: the committed state on back has those fields
      // populated by completeTransition (transition meta is rebuilt for the
      // replay, but the snapshot path/params/name flow through unchanged).
      await waitForHistoryNavigation(router, () => {
        router.back();
      });

      const restored = router.getState();

      expect(restored?.name).toBe("users");
      expect(restored?.path).toBe("/users");
      expect(restored?.transition).toBeDefined();
      expect(restored?.context).toBeDefined();
    });
  });
});

describe("async-guard back() + concurrent navigate() — stack integrity (#1234)", () => {
  // Residual of #807: #807 fixed the SYNC race (back(); navigate() same tick),
  // but an ASYNC canActivate on the back() target keeps the restore
  // navigateToState in flight. A concurrent navigate() cancels the back and
  // commits synchronously — its onTransitionSuccess is the first after the flag
  // was set, so the timing-based consumption steals the flag and records the
  // forward navigate as a phantom history-restore (no push, direction "back",
  // historyIndex 1). The flag must be attributed by IDENTITY (source), not timing.
  it("records the concurrent navigate as a forward push, not a phantom history-restore", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "settings", path: "/settings" },
      { name: "profile", path: "/profile" },
    ]);

    r.usePlugin(memoryPluginFactory());
    await r.start("/");
    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings] idx 2

    // async canActivate on the back() target → navigateToState stays in flight
    getLifecycleApi(r).addActivateGuard(
      "users",
      () => () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 20),
        ),
    );

    (r as Router & { back: () => void }).back(); // #go(-1) → users, in flight
    await r.navigate("profile").catch(() => {}); // cancels back, commits sync

    const state = r.getState();

    expect(state?.name).toBe("profile");

    const mem = (
      state?.context as
        { memory?: { direction: string; historyIndex: number } } | undefined
    )?.memory;

    // The forward navigate must be recorded as a navigate, not the cancelled
    // back's phantom restore.
    expect(mem?.direction).toBe("navigate");
    expect(mem?.historyIndex).toBe(2);
  });

  it("deep go(-2) with the same race keeps #index in bounds — the optimistic-index sibling", async () => {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "settings", path: "/settings" },
      { name: "profile", path: "/profile" },
      { name: "dashboard", path: "/dashboard" },
    ]);

    r.usePlugin(memoryPluginFactory());
    await r.start("/");
    await r.navigate("users");
    await r.navigate("settings");
    await r.navigate("profile"); // [home, users, settings, profile] idx 3

    getLifecycleApi(r).addActivateGuard(
      "users",
      () => () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 20),
        ),
    );

    (r as Router & { go: (delta: number) => void }).go(-2); // → users, in flight
    await r.navigate("dashboard").catch(() => {}); // cancels the #go, commits sync

    const state = r.getState();

    expect(state?.name).toBe("dashboard");

    const mem = (
      state?.context as
        { memory?: { direction: string; historyIndex: number } } | undefined
    )?.memory;

    expect(mem?.direction).toBe("navigate");
    // The cancelled #go's .catch reverts #index ONLY if still ours; the
    // concurrent push already re-based it, so it stays 2 (in bounds), not
    // previousIndex 3 (which would be out of bounds).
    expect(mem?.historyIndex).toBe(2);
  });
});
