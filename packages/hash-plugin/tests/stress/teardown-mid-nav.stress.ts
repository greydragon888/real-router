import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, noop, waitForTransitions } from "./helpers";

describe("Teardown Mid-Navigation (Hash)", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("teardown while an async-guarded navigation is pending: no unhandled errors", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start();

    getLifecycleApi(router).addActivateGuard(
      "users.view",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 30);
        }),
    );

    const unhandled: unknown[] = [];
    const listener = (event: PromiseRejectionEvent | { reason?: unknown }) => {
      unhandled.push("reason" in event ? event.reason : event);
    };

    (globalThis as any).addEventListener?.("unhandledrejection", listener);

    const pending = router.navigate("users.view", { id: "1" }).catch(noop);

    // Tear down (plugin only) while the guard is still resolving. The core
    // router stays active, so the in-flight transition still settles — but it
    // must settle into a COHERENT state, never a half-committed / corrupt one.
    unsubscribe();

    await pending;
    await waitForTransitions(60);

    expect(unhandled).toHaveLength(0);

    // Whatever route won, the committed state must be internally consistent:
    // its path must be exactly what buildPath() produces for its name+params
    // (a torn/corrupt commit would leave name and path disagreeing).
    const after = router.getState();

    expect(after).toBeDefined();
    expect(after?.name).toBe("users.view");
    expect(after?.path).toBe(router.buildPath(after!.name, after!.params));
    expect(after?.params).toStrictEqual({ id: "1" });

    (globalThis as any).removeEventListener?.("unhandledrejection", listener);
  });

  it("teardown races popstate storm: router stays consistent, no listener leak", async () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");

    const { router, dispatchPopstate, unsubscribe } = createStressRouter();

    await router.start();

    for (let i = 0; i < 20; i++) {
      dispatchPopstate({ name: "home", params: {}, path: "/home" });
    }

    unsubscribe();

    await waitForTransitions(80);

    const added = addSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;
    const removed = removeSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;

    expect(removed).toBeGreaterThanOrEqual(added);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("1000 navigate cycles: exactly one popstate listener active", async () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");

    const { router, unsubscribe } = createStressRouter();

    await router.start();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(i % 2 === 0 ? "home" : "users.list").catch(noop);
    }

    const added = addSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;
    const removed = removeSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;

    // Exactly one listener outstanding (added - removed === 1).
    expect(added - removed).toBe(1);

    router.stop();
    unsubscribe();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("HMR-style factory reuse across 100 routers: only last listener remains", async () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");

    const { router: firstRouter, unsubscribe: firstUnsub } =
      createStressRouter();

    await firstRouter.start();
    firstRouter.stop();
    firstUnsub();

    const routers = Array.from({ length: 100 }, () => createStressRouter());

    for (const r of routers) {
      await r.router.start();
      await r.router.navigate("users.list").catch(noop);
      r.router.stop();
      r.unsubscribe();
    }

    const added = addSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;
    const removed = removeSpy.mock.calls.filter(
      ([event]) => event === "popstate",
    ).length;

    // After tearing everything down: zero listeners active.
    expect(added).toBe(removed);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("popstate event dispatched during teardown: handler swallows buildUrl-after-teardown gracefully (M2)", async () => {
    const { router, dispatchPopstate, unsubscribe } = createStressRouter();

    await router.start();
    await router.navigate("users.list").catch(noop);

    const unhandled: unknown[] = [];
    const listener = (event: PromiseRejectionEvent | { reason?: unknown }) => {
      unhandled.push("reason" in event ? event.reason : event);
    };

    (globalThis as any).addEventListener?.("unhandledrejection", listener);

    // Fire popstate while teardown is in flight — the handler must not throw
    // even if router.buildUrl has already been removed from the instance.
    dispatchPopstate({ name: "home", params: {}, path: "/home" });
    unsubscribe();

    await waitForTransitions(50);

    expect(unhandled).toHaveLength(0);

    // The handler must have swallowed the buildUrl-after-teardown path WITHOUT
    // corrupting state. Whatever route is current (the popstate-driven "home"
    // or the prior "users.list"), it must be a real route with a consistent
    // name↔path pairing — never a torn state with name and path disagreeing.
    const after = router.getState();

    expect(after).toBeDefined();
    expect(["home", "users.list"]).toContain(after?.name);
    expect(after?.path).toBe(router.buildPath(after!.name, after!.params));

    (globalThis as any).removeEventListener?.("unhandledrejection", listener);
  });

  it("navigate() called after teardown: resolves fresh & consistent, never stale (M8)", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start();
    const stateBefore = router.getState();

    unsubscribe();

    // Teardown unsubscribes the PLUGIN only (removes the popstate handler and
    // router extensions); the core router stays active, so navigate() resolves
    // with a fresh state for the requested route — never throws synchronously,
    // and never resolves to a stale/wrong state.
    const resolved = await router.navigate("users.list").catch(() => null);

    expect(() => router.getState()).not.toThrow();

    // The resolution is the genuinely-requested route (not the stale
    // pre-teardown route), getState() agrees with the resolved value, and the
    // committed state is internally consistent (name↔path).
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe("users.list");
    expect(resolved?.name).not.toBe(stateBefore?.name);
    expect(router.getState()?.name).toBe("users.list");
    expect(resolved?.path).toBe(
      router.buildPath(resolved!.name, resolved!.params),
    );
  });

  it("replaceHistoryState called during an active transition: URL updates do not corrupt state (M3)", async () => {
    const { router, browser, unsubscribe } = createStressRouter();

    await router.start();

    const replaceSpy = vi.spyOn(browser, "replaceState");

    // Slow guard keeps transition in-flight during replaceHistoryState.
    getLifecycleApi(router).addActivateGuard(
      "users.view",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 30);
        }),
    );

    const pending = router.navigate("users.view", { id: "1" }).catch(noop);

    // Mid-flight: rewrite history state for a different route.
    router.replaceHistoryState("home");

    await pending;
    await waitForTransitions(50);

    // replaceHistoryState must have fired at least once with the "home" URL.
    const homeCall = replaceSpy.mock.calls.find(
      ([, url]) => typeof url === "string" && url.endsWith("/home"),
    );

    expect(homeCall).toBeDefined();
    // Router state after navigate() resolves should be users.view (the winner
    // of navigation), not "home" — replaceHistoryState only rewrites the URL.
    expect(router.getState()?.name).toBe("users.view");

    replaceSpy.mockRestore();
    router.stop();
    unsubscribe();
  });
});
