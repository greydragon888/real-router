import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

describe("N20 — traverseTo to an evicted or invalid key", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("N20.1: browser.traverseTo throws for evicted key — plugin clears pendingTraverseKey, next navigate uses browser.navigate", async () => {
    // Scenario: traverseToLast captures a key and begins router.navigate.
    // Before onTransitionSuccess fires, the browser evicts that entry
    // (simulated here by mocking browser.traverseTo to throw, since
    // MockNavigation doesn't expose eviction). Real Navigation API will
    // throw `InvalidStateError` from traverseTo when the key no longer
    // resolves — we're pinning the plugin's tolerance for that.
    //
    // Contract: even if traverseTo throws inside onTransitionSuccess, the
    // plugin must clear #pendingTraverseKey *before* the attempt, so the
    // NEXT transition does not replay the traverse against the stale key.
    // (router.navigate itself may resolve successfully — the core router
    // does not observe success-hook errors.)
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("users.view", { id: "1" });
    await router.navigate("home");

    // Mock traverseTo to simulate the target entry being evicted after the
    // plugin captured its key but before onTransitionSuccess used it.
    const traverseToSpy = vi
      .spyOn(browser, "traverseTo")
      .mockImplementation(() => {
        throw new DOMException(
          "Target entry evicted by memory pressure",
          "InvalidStateError",
        );
      });

    // traverseToLast resolves the router.navigate — onTransitionSuccess
    // errors are swallowed by the core. We don't care whether it throws
    // or resolves; we care that the key is cleared.
    await router.traverseToLast("users.list").catch(noop);

    expect(traverseToSpy).toHaveBeenCalled();

    traverseToSpy.mockRestore();

    // Router must still be usable. Most importantly, a subsequent navigation
    // must not accidentally pick up a stale pendingTraverseKey — the next
    // call should go through browser.navigate, not browser.traverseTo.
    const navigateSpy = vi.spyOn(browser, "navigate");
    const traverseAfterSpy = vi.spyOn(browser, "traverseTo");

    await router.navigate("users.view", { id: "42" });

    expect(router.getState()?.name).toBe("users.view");
    expect(router.getState()?.params.id).toBe("42");
    expect(navigateSpy).toHaveBeenCalled();
    expect(traverseAfterSpy).not.toHaveBeenCalled();
  });

  it("N20.2: 50 cycles of traverseTo-throws → navigate — no stale key accumulation", async () => {
    // Storm version of N20.1: repeatedly trigger traverseTo failures and
    // verify that each failure is isolated — no residue bleeds into the
    // next cycle.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();

    for (let i = 0; i < 50; i++) {
      // Build a history that traverseToLast can find.
      await router.navigate("users.list").catch(noop);
      await router.navigate("home").catch(noop);
      await router.navigate("users.view", { id: String(i) }).catch(noop);

      // Make the next traverseTo throw.
      const spy = vi.spyOn(browser, "traverseTo").mockImplementation(() => {
        throw new DOMException("Evicted", "InvalidStateError");
      });

      await router.traverseToLast("users.list").catch(noop);

      expect(spy).toHaveBeenCalled();

      spy.mockRestore();

      // Next real navigate must use browser.navigate, not a leaked key.
      const navigateSpy = vi.spyOn(browser, "navigate");
      const traverseSpy = vi.spyOn(browser, "traverseTo");

      await router.navigate("home");

      expect(navigateSpy).toHaveBeenCalled();
      expect(traverseSpy).not.toHaveBeenCalled();

      navigateSpy.mockRestore();
      traverseSpy.mockRestore();
    }

    // Final sanity: router still responsive after 50 evict-recover cycles.
    await router.navigate("users.list");

    expect(router.getState()?.name).toBe("users.list");
  });

  it("N20.3: traverseTo throws, then subsequent traverseToLast to a different route succeeds", async () => {
    // Verifies that a failed traverseTo does not poison the plugin's ability
    // to do future traverseTo operations to OTHER routes.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("users.view", { id: "a" });
    await router.navigate("home");
    await router.navigate("users.view", { id: "b" });

    const failingSpy = vi
      .spyOn(browser, "traverseTo")
      .mockImplementation(() => {
        throw new DOMException("Evicted", "InvalidStateError");
      });

    await router.traverseToLast("users.list").catch(noop);

    expect(failingSpy).toHaveBeenCalled();

    failingSpy.mockRestore();

    // Now traverseTo should work again — no residual state in the plugin.
    const state = await router.traverseToLast("home");

    expect(state.name).toBe("home");
  });

  it("N20.4: after traverseTo failure, isSyncingFromRouter flag is released (subsequent navigate events are not skipped)", async () => {
    // Invariant D1/D2/D4: the syncing flag is reset even when traverseTo
    // throws mid-onTransitionSuccess. If it weren't, browser-initiated
    // navigate events would be silently skipped forever.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser, mockNav } = result;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("home");

    const spy = vi.spyOn(browser, "traverseTo").mockImplementationOnce(() => {
      throw new DOMException("Evicted", "InvalidStateError");
    });

    await router.traverseToLast("users.list").catch(noop);

    spy.mockRestore();

    // Browser-initiated navigate must not be ignored — if isSyncingFromRouter
    // were stuck in `true`, the handler would early-return and router would
    // never transition.
    const { finished } = mockNav.navigate("http://localhost/users/view/42");

    await finished;
    await waitForTransitions();

    expect(router.getState()?.name).toBe("users.view");
    expect(router.getState()?.params.id).toBe("42");
  });
});
