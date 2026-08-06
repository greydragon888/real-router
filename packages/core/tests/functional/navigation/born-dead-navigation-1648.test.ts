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

/**
 * ⚑ **The seam catches a SECOND class, and it is not born-dead (#1684).**
 *
 * `FSM.send` returns `this.#state` read AFTER the update, the action and the
 * listeners, so `startTransition` answers "where is the machine NOW", not "did
 * the edge fire". The one piece of application code that runs inside the
 * `NAVIGATE` action is a `TRANSITION_START` listener, and three things it can do
 * move the machine back off `TRANSITION_STARTED`: `stop()`, `dispose()`, and —
 * since the external-signal bridge was raised above the announce (#1684) —
 * aborting the caller's `opts.signal`. Everything else it might reach is
 * refused: a reentrant navigate throws `REENTRANT_NAVIGATION`, `replace` /
 * `clear` are logged no-ops while transitioning.
 *
 * On this class the announce DID happen — a plugin heard `TRANSITION_START`, and
 * a terminal `TRANSITION_CANCEL` has already been emitted — so the sentence
 * above ("`TRANSITION_START` never fired, no plugin heard of it") describes the
 * motivating arc, not the branch. `ctx.inflight` still holds this very plan,
 * because `CANCEL` deliberately does not clear it (#1671).
 *
 * ⚠ **And here the seam does MORE than save an allocation.** The claim that
 * "the guards are not asked either way" holds for the born-dead arc and for
 * `stop()` / `dispose()`, where the `runStep` fence answers `isActive() ===
 * false`. It does NOT hold for the external signal: `CANCEL` leaves the machine
 * in `READY` and does not clear `ctx.inflight`, so both terms of that fence are
 * still true. Measured with the seam neutered, guard arc, abort from
 * `onTransitionStart`:
 *
 * | source     | controllers | guards asked |
 * | ---------- | ----------- | ------------ |
 * | external   | 1           | both         |
 * | `stop()`   | 1           | none         |
 * | `dispose()`| 0           | none         |
 *
 * — against 0 and none for all three with the seam in place. The `dispose()`
 * row is therefore NOT discriminating on the counter and is kept for the source
 * axis only: `dispose()` tears the guard maps down on its way out, so
 * `planPhases` finds nothing to arm whatever this branch decides.
 *
 * ⚠ This also fails on the "witness" form proposed in #1681
 * (`ctx.inflight === payload` in place of the state comparison): the witness is
 * TRUE on the external and `stop()` arcs, so both would walk on. Measured — that
 * form leaves the whole tier green (3987/3987 + 449/449) and reds only these
 * cells, which is why they are here.
 */
describe("#1648 seam — a navigation cancelled from inside its own announce", () => {
  type Source = "external" | "stop" | "dispose";

  const SOURCES: Source[] = ["external", "stop", "dispose"];

  interface Run {
    readonly code: string | undefined;
    readonly starts: string[];
    readonly cancels: number;
    readonly errors: number;
    readonly guards: string[];
    readonly controllers: number;
  }

  async function run(source: Source): Promise<Run> {
    const starts: string[] = [];
    const guards: string[] = [];
    let cancels = 0;
    let errors = 0;

    const local = createRouter([
      {
        name: "a",
        path: "/a",
        canDeactivate: () => () => {
          guards.push("canDeactivate:a");

          return true;
        },
      },
      {
        name: "b",
        path: "/b",
        canActivate: () => () => {
          guards.push("canActivate:b");

          return true;
        },
      },
    ]);

    await local.start("/a");

    // A REAL controller: the counter must see only what core allocates.
    const external = new RealAbortController();

    // Registered after `start()`, so the hook fires for the measured navigation.
    local.usePlugin(() => ({
      onTransitionStart: (toState) => {
        starts.push(toState.name);

        if (source === "external") {
          external.abort(new Error("cancelled by the app"));
        } else if (source === "stop") {
          local.stop();
        } else {
          local.dispose();
        }
      },
      onTransitionCancel: () => {
        cancels += 1;
      },
      onTransitionError: () => {
        errors += 1;
      },
    }));

    created = 0;

    const code = await local
      .navigate(
        "b",
        {},
        undefined,
        source === "external" ? { signal: external.signal } : {},
      )
      .then(
        () => undefined,
        (error: unknown) => (error as { code?: string }).code,
      );

    return { code, starts, cancels, errors, guards, controllers: created };
  }

  beforeEach(() => {
    vi.stubGlobal("AbortController", CountingAbortController);
    created = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(SOURCES)(
    "%s from onTransitionStart: announced, cancelled once, and refused at the seam",
    async (source) => {
      const result = await run(source);

      // POSITIVE CONTROL — this is NOT the born-dead arc above: the announce
      // ran and a plugin heard it. Without this the cells would pass for the
      // wrong reason if they ever stopped reaching the announce at all.
      expect(result.starts).toStrictEqual(["b"]);

      // One terminal event, and the right one.
      expect(result.cancels).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.code).toBe(errorCodes.TRANSITION_CANCELLED);

      // THE discriminating assertion on the external and `stop()` cells (see the
      // table above); carried by `dispose()`'s own teardown on the third.
      expect(result.controllers).toBe(0);
      expect(result.guards).toStrictEqual([]);
    },
  );
});
