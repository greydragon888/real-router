import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { Mock } from "vitest";

/**
 * #1648 — a navigation whose `NAVIGATE` edge never fired must not proceed.
 *
 * `canNavigate()` is asked before the target state is built, and building it
 * runs USER code: the `forwardState` interceptor chain, the route's codecs, the
 * option callbacks. A `stop()` from there leaves the machine in `IDLE`, where
 * `NAVIGATE` is not declared — so the send is a table no-op, `TRANSITION_START`
 * never fires, and the machine is not carrying this navigation at all. It is
 * BORN DEAD.
 *
 * It used to walk on regardless and get refused at the very end, by a
 * coincidence of topology rather than by anything that had decided it
 * (`COMPLETE` is not declared where it had landed). Since the identity became
 * the plan object, `startTransition` reports whether the edge fired and the
 * pipeline refuses at the seam.
 *
 * ⚠ **The rejection is NOT what discriminates, and neither are the guards.**
 * Both configurations reject `TRANSITION_CANCELLED`, and the liveness fence at
 * the head of `runStep` already stops the walk before any guard is asked —
 * measured, both ways. What the seam check removes is the WORK a dead
 * navigation does on its way to the same answer, and the countable part of it
 * is the `AbortController` the guard branch allocates. So this is pinned the
 * way `guards-off-path.test.ts` and `controller-allocation.test.ts` pin their
 * own behaviourally-equivalent waste: by COUNTING, never by outcome.
 */

const RealAbortController = AbortController;

let created: number;

class CountingAbortController extends RealAbortController {
  constructor() {
    super();
    created++;
  }
}

describe("#1648 — a born-dead navigation is refused at the seam", () => {
  let router: Router;
  let activate: Mock<() => boolean>;
  let deactivate: Mock<() => boolean>;
  let starts: string[];
  let armed: boolean;

  beforeEach(async () => {
    vi.stubGlobal("AbortController", CountingAbortController);

    activate = vi.fn<() => boolean>(() => true);
    deactivate = vi.fn<() => boolean>(() => true);
    starts = [];
    armed = false;

    router = createRouter([
      { name: "a", path: "/a", canDeactivate: () => deactivate },
      { name: "b", path: "/b", canActivate: () => activate },
    ]);

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name: string, params, search) => {
        // The shipped way into this window: `canNavigate()` has already said
        // yes, and this runs before the send.
        if (armed && name === "b") {
          armed = false;
          router.stop();
        }

        return next(name, params, search);
      },
    );

    router.usePlugin(() => ({
      onTransitionStart(toState) {
        starts.push(toState.name);
      },
    }));

    await router.start("/a");

    activate.mockClear();
    deactivate.mockClear();
    starts.length = 0;
    created = 0;
    armed = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    router.dispose();
  });

  it("rejects TRANSITION_CANCELLED without announcing the transition", async () => {
    await expect(router.navigate("b")).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    expect(starts).toStrictEqual([]);
    expect(router.getState()).toBeUndefined();
    expect(router.isActive()).toBe(false);
  });

  it("allocates no AbortController for it — THE discriminating assertion", async () => {
    // Without the seam check the navigation runs `planPhases`, sees guards on
    // its path and allocates a controller for a transition nobody was told
    // about, only to be thrown out by the `runStep` fence a moment later. This
    // is the one observable that separates the two configurations: removing the
    // check turns this 0 into 1.
    await expect(router.navigate("b")).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    expect(created).toBe(0);
  });

  it("does not ask the application's guards — held by the runStep fence, not by this check", async () => {
    // Recorded so the division of labour stays visible: this passes in BOTH
    // configurations, which is exactly why it is not the assertion above.
    await expect(router.navigate("b")).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    expect(activate).not.toHaveBeenCalled();
    expect(deactivate).not.toHaveBeenCalled();
  });
});
