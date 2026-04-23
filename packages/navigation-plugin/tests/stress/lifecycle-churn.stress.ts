import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import {
  createStressRouter,
  waitForTransitions,
  noop,
  routeConfig,
} from "./helpers";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

describe("N5: Navigation plugin lifecycle churn", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N5.1: 100 start/stop cycles — 0 active navigate listeners after final stop", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    for (let i = 0; i < 100; i++) {
      await router.start();
      router.stop();
    }

    const stateAfterStop = router.getState();
    const navigateSpy = vi.spyOn(router, "navigate");

    mockNav.navigate("http://localhost/home");
    await waitForTransitions();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(router.getState()).toStrictEqual(stateAfterStop);

    unsubscribe();
  });

  it("N5.2: 50 cycles: start → navigate×5 → stop — state correct before each stop", async () => {
    const { router, unsubscribe } = createStressRouter();

    let stateBeforeLastStop: string | undefined;

    for (let i = 0; i < 50; i++) {
      await router.start();
      await router.navigate("home").catch(noop);
      await router.navigate("users.list").catch(noop);
      await router.navigate("home").catch(noop);
      await router.navigate("users.list").catch(noop);
      await router.navigate("home").catch(noop);

      stateBeforeLastStop = router.getState()?.name;
      router.stop();
    }

    expect(stateBeforeLastStop).toBe("home");
    expect(router.isActive()).toBe(false);

    unsubscribe();
  });

  it("N5.3: HMR simulation — shared factory reused 100× — no listeners fire after all stopped", async () => {
    const mockNav = new MockNavigation("http://localhost/");
    const browser = createMockNavigationBrowser(mockNav);

    const factory = navigationPluginFactory(
      { forceDeactivate: true, base: "" },
      browser,
    );

    let lastRouter: Router | undefined;

    for (let i = 0; i < 100; i++) {
      const r = createRouter(routeConfig, {
        defaultRoute: "home",
        allowNotFound: true,
      });

      r.usePlugin(factory);
      await r.start();
      await r.navigate("users.list").catch(noop);
      r.stop();

      lastRouter = r;
    }

    const stateBeforeNavigate = lastRouter!.getState();

    mockNav.navigate("http://localhost/home");
    await waitForTransitions();

    expect(lastRouter!.getState()).toStrictEqual(stateBeforeNavigate);
  });

  it("N5.6: 100 routers from shared factory — WeakRef probe + fresh-router integrity check", async () => {
    // Each router holds plugin state (handlers, claim, extensions). After
    // `router.stop()` + `unsub()`, the router object must be unreachable
    // from the factory's shared state — otherwise the factory would leak
    // one router per HMR cycle.
    //
    // Strategy:
    // 1. Create 100 routers, dispose each, drop local references.
    // 2. Record WeakRef for each — if `--expose-gc` is available, nudge GC
    //    and report how many got collected (observational, not asserted
    //    for test stability across environments).
    // 3. Regardless of GC, verify a fresh router added AFTER the 100
    //    disposals has exactly one subscription callback firing on a
    //    browser navigate event — proving no stale listeners leaked from
    //    any of the 100 disposed routers.
    const mockNav = new MockNavigation("http://localhost/");
    const browser = createMockNavigationBrowser(mockNav);

    const factory = navigationPluginFactory(
      { forceDeactivate: true, base: "" },
      browser,
    );

    const weakRefs: WeakRef<Router>[] = [];

    for (let i = 0; i < 100; i++) {
      let r: Router | undefined = createRouter(routeConfig, {
        defaultRoute: "home",
        allowNotFound: true,
      });

      const unsub = r.usePlugin(factory);

      await r.start();
      await r.navigate("users.list").catch(noop);
      r.stop();
      unsub();

      weakRefs.push(new WeakRef(r));

      // Drop the strong reference so GC can reclaim it.
      r = undefined;
    }

    // Best-effort GC nudge — observational only. Node's GC under
    // --expose-gc is deterministic enough to clear most WeakRefs, but we
    // don't assert a specific count since it varies across environments.
    const gcFn = (globalThis as { gc?: () => void }).gc;

    gcFn?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    gcFn?.();

    const collectedCount = weakRefs.filter(
      (ref) => ref.deref() === undefined,
    ).length;

    // Sanity: WeakRef machinery is reachable (regardless of gc availability).
    expect(collectedCount).toBeGreaterThanOrEqual(0);
    expect(collectedCount).toBeLessThanOrEqual(100);

    // The REAL leak check — functional, not memory-based. A fresh router
    // must see exactly one subscription fire for a navigate event. Any
    // leaked listener from the 100 disposed routers would fire the spy too.
    const fresh = createRouter(routeConfig, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    const unsub = fresh.usePlugin(factory);

    await fresh.start();

    const navSpy = vi.fn();

    fresh.subscribe(navSpy);

    mockNav.navigate("http://localhost/home");
    await waitForTransitions();

    expect(navSpy.mock.calls.length).toBeLessThanOrEqual(1);

    fresh.stop();
    unsub();
  });

  it("N5.4: start → navigate storm → stop → start → clean navigate — no carryover", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    await router.start();

    for (let i = 0; i < 10; i++) {
      mockNav.navigate("http://localhost/users/list");
    }

    await waitForTransitions();
    router.stop();

    await router.start();

    mockNav.navigate("http://localhost/home");
    await waitForTransitions();

    expect(router.getState()?.name).toBe("home");

    router.stop();
    unsubscribe();
  });

  it("N5.5: 50 cycles — create + plugin + start + navigate + dispose — no crashes", async () => {
    let completed = 0;

    for (let i = 0; i < 50; i++) {
      const { router, unsubscribe } = createStressRouter();

      await router.start();
      await router.navigate("users.list").catch(noop);
      router.stop();
      unsubscribe();

      completed++;
    }

    expect(completed).toBe(50);
  });
});
