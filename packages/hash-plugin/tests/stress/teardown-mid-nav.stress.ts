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

    // Tear down while the guard is still resolving.
    unsubscribe();

    await pending;
    await waitForTransitions(60);

    expect(unhandled).toHaveLength(0);

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
});
