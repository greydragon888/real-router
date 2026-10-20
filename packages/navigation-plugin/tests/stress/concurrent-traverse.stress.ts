import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
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

/**
 * Holds every activation of `users.list` for a few milliseconds. Without it a
 * `traverseToLast("users.list")` completes inside its own call, and a navigate
 * issued after it never overlaps it (#2754).
 */
function holdTraverseTarget(): void {
  getLifecycleApi(router).addActivateGuard(
    "users.list",
    () => () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 5);
      }),
  );
}

describe("N13 — concurrent traverseToLast", () => {
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

  it("N13.1: two concurrent traverseToLast calls do not leave router in an invalid state", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("users.view", { id: "1" });
    await router.navigate("home");
    await router.navigate("users.view", { id: "2" });

    const a = router
      .traverseToLast("users.list")
      .catch((error: unknown) => error);
    const b = router
      .traverseToLast("users.view")
      .catch((error: unknown) => error);

    await Promise.allSettled([a, b]);
    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();
    expect(["users.list", "users.view", "home"]).toContain(finalState?.name);

    // canGoBack / canGoForward are booleans — index not corrupted by the race.
    expect(typeof router.canGoBack()).toBe("boolean");
    expect(typeof router.canGoForward()).toBe("boolean");
  });

  it("N13.2: traverseToLast vs concurrent router.navigate — the traverse record does not leak across transitions", async () => {
    // Race scenario: traverseToLast stages its record — the entry to traverse
    // to — and calls router.navigate internally. While that transition is in
    // flight, a concurrent router.navigate supersedes it. If the second
    // transition consumed the first one's record, onTransitionSuccess would
    // call browser.traverseTo(stale-key) for it and push the browser history
    // into an inconsistent state — URL matches the first traversal target
    // while the router state matches the second navigate.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();

    // Build a deep history so traverseToLast has multiple candidates.
    await router.navigate("users.list");
    await router.navigate("users.view", { id: "1" });
    await router.navigate("users.list");
    await router.navigate("users.view", { id: "2" });
    await router.navigate("home");
    holdTraverseTarget();

    for (let cycle = 0; cycle < 30; cycle++) {
      // traverseToLast("users.list") and navigate("users.view", ...) race.
      // One wins, the other is cancelled or superseded.
      const traverseP = router
        .traverseToLast("users.list")
        .catch((error: unknown) => error);
      const navigateP = router
        .navigate("users.view", { id: `race-${cycle}` })
        .catch((error: unknown) => error);

      await Promise.allSettled([traverseP, navigateP]);
      await waitForTransitions();

      // The two overlapped: the navigate superseded the held traverse.
      await expect(traverseP).resolves.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      const state = router.getState();
      const url = mockNav.currentUrl;

      expect(state).toBeDefined();

      // Consistency invariant: the URL in the browser history must match the
      // router's current state. If the traverse record leaked, the browser
      // would be on the traverseTo target while the router thinks it's on
      // the navigate target (or vice versa).
      const expectedPath = state!.path;

      expect(url).toContain(expectedPath);

      // Reset to a deep history for the next race. Races may leave the
      // router on any of the target routes, so catch SAME_STATES.
      await router.navigate("users.list").catch(noop);
      await router.navigate("users.view", { id: `reset-${cycle}` }).catch(noop);
      await router.navigate("home").catch(noop);
    }

    // After 30 race cycles, router must still be responsive and not stuck.
    await router.navigate("users.list").catch(noop);
    await router.navigate("home").catch(noop);

    expect(router.getState()?.name).toBe("home");
  });

  it("N13.3: router.navigate supersedes pending traverseToLast — no stale key leaks into a later transition", async () => {
    // Verifies that if a traverse is superseded before its onTransitionSuccess,
    // its record — the entry to traverse to — does NOT leak into a transition
    // that succeeds afterwards: the superseding one, nor the one after it. A
    // superseded transition's record is filed under its own toState.context,
    // which no later state carries, so no later success finds it — not even
    // after a throw at the traverse site.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser, mockNav } = result;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("home");
    await router.navigate("users.view", { id: "1" });
    holdTraverseTarget();

    const navigateSpy = vi.spyOn(browser, "navigate");
    const traverseSpy = vi.spyOn(browser, "traverseTo");

    // Fire traverseToLast without awaiting — it stages its record
    // synchronously and starts the navigation, which the guard holds.
    const traverseP = router
      .traverseToLast("users.list")
      .catch((error: unknown) => error);

    // Immediately supersede with a different navigation.
    const supersedeP = router
      .navigate("users.view", { id: "2" })
      .catch((error: unknown) => error);

    await Promise.allSettled([traverseP, supersedeP]);
    await waitForTransitions();

    // The superseding navigation lands the browser on its own URL.
    expect(router.getState()?.path).toBe("/users/view/2");
    expect(mockNav.currentUrl).toContain("/users/view/2");

    // A fresh programmatic navigate goes through browser.navigate — never
    // browser.traverseTo with a stale key.
    navigateSpy.mockClear();
    await router.navigate("home");

    // Router reached "home" via a push (normal flow), NOT via a traverseTo
    // call using a leftover key from the cancelled traverseToLast.
    expect(router.getState()?.name).toBe("home");
    expect(navigateSpy).toHaveBeenCalled();
    expect(traverseSpy).not.toHaveBeenCalled();

    navigateSpy.mockRestore();
    traverseSpy.mockRestore();
  });
});
