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

  it("N13.2: traverseToLast vs concurrent router.navigate — pendingTraverseKey does not leak across transitions", async () => {
    // Race scenario: traverseToLast captures #pendingTraverseKey, calls
    // router.navigate internally. While that promise is in flight, a
    // concurrent router.navigate fires. If #pendingTraverseKey were leaked
    // between the two transitions, onTransitionSuccess would call
    // browser.traverseTo(stale-key) for the second navigation and push the
    // browser history into an inconsistent state — URL matches the first
    // traversal target while the router state matches the second navigate.
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

      const state = router.getState();
      const url = mockNav.currentUrl;

      expect(state).toBeDefined();

      // Consistency invariant: the URL in the browser history must match the
      // router's current state. If pendingTraverseKey leaked, the browser
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

  it("N13.3: router.navigate supersedes pending traverseToLast — no stale key leaks into next transition", async () => {
    // Verifies that if a transition is cancelled/superseded between setting
    // #pendingTraverseKey (inside traverseToLast) and the onTransitionSuccess
    // hook, the key does NOT leak into whatever transition succeeds next.
    // The core's TRANSITION_CANCEL and TRANSITION_ERROR hooks must clear it;
    // with the clear-before-attempt fix in plugin.ts onTransitionSuccess,
    // even a throw at the traverse site cannot poison subsequent transitions.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("home");
    await router.navigate("users.view", { id: "1" });

    // Fire traverseToLast without awaiting — it will set #pendingTraverseKey
    // synchronously and start the navigation.
    const traverseP = router
      .traverseToLast("users.list")
      .catch((error: unknown) => error);

    // Immediately supersede with a different navigation.
    const supersedeP = router
      .navigate("users.view", { id: "2" })
      .catch((error: unknown) => error);

    await Promise.allSettled([traverseP, supersedeP]);
    await waitForTransitions();

    // After the race settled, fire a fresh programmatic navigate and verify
    // it goes through browser.navigate — never browser.traverseTo with a
    // stale key. This is the invariant: cleanup hooks must have cleared
    // #pendingTraverseKey before the next transition starts.
    const navigateSpy = vi.spyOn(browser, "navigate");
    const traverseSpy = vi.spyOn(browser, "traverseTo");

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
